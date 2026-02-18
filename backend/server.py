from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import json
import base64
import io
import time
import asyncio
from datetime import datetime, timezone
from pathlib import Path


from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from collections import deque
from dataclasses import dataclass, field
import numpy as np
import torch
from faster_whisper import WhisperModel
from pyannote.audio import Pipeline

import httpx
import uuid
from openai import AsyncOpenAI
from emergentintegrations.llm.chat import LlmChat, UserMessage
from vector_store import (
    save_profile_index,
    load_profile_meta,
    profile_index_exists,
    clear_profile_cache,
    search_profile_context
)



load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
if not DB_NAME:
    raise RuntimeError("DB_NAME is required")

app = FastAPI(title="Interview Assistant AI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


cv_col = db["cv_documents"]
sessions_col = db["interview_sessions"]
messages_col = db["conversation_messages"]
profiles_col = db["profiles"]


# ========== IN-MEMORY CACHE FOR CV (avoid DB roundtrip) ==========
_cv_cache: Dict[str, Any] = {"data": None, "loaded_at": 0}

async def get_cached_cv():
    """Get CV from cache or DB. Cache expires after 60s."""
    now = time.time()
    if _cv_cache["data"] and (now - _cv_cache["loaded_at"]) < 60:
        return _cv_cache["data"]
    cv_doc = await cv_col.find_one({"is_active": True})
    if cv_doc:
        _cv_cache["data"] = cv_doc.get("parsed_data")
        _cv_cache["loaded_at"] = now
    return _cv_cache["data"]

def invalidate_cv_cache():
    """Call when CV is updated/uploaded."""
    _cv_cache["data"] = None
    _cv_cache["loaded_at"] = 0

# ========== SESSION LANGUAGE TRACKING ==========
_session_lang: Dict[str, str] = {}

def get_session_lang(session_id: str) -> str:
    """Get last detected language for session (fallback for ambiguity)."""
    return _session_lang.get(session_id, "fr")

def set_session_lang(session_id: str, lang: str):
    """Update session language."""
    if lang in ("fr", "en", "french", "english"):
        normalized = "fr" if lang in ("fr", "french") else "en"
        _session_lang[session_id] = normalized

ROLE_TEMPLATES_PATH = Path(__file__).resolve().parent / "data" / "prompt_templates.json"


def load_role_templates() -> Dict[str, str]:
    if not ROLE_TEMPLATES_PATH.exists():
        return {}
    return json.loads(ROLE_TEMPLATES_PATH.read_text())


ROLE_TEMPLATES = load_role_templates()


def get_role_template(target_role: Optional[str]) -> str:
    if not target_role:
        return ""
    key = target_role.lower().replace(" ", "_")
    return ROLE_TEMPLATES.get(key, "")




WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "small")
WHISPER_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
WHISPER_WINDOW_SECONDS = int(os.environ.get("WHISPER_WINDOW_SECONDS", "18"))
WHISPER_MIN_SECONDS = float(os.environ.get("WHISPER_MIN_SECONDS", "2"))
TRANSCRIBE_INTERVAL = float(os.environ.get("TRANSCRIBE_INTERVAL", "1.6"))
DIARIZATION_INTERVAL = float(os.environ.get("DIARIZATION_INTERVAL", "8"))
ENABLE_DIARIZATION = os.environ.get("ENABLE_DIARIZATION", "true").lower() == "true"

_whisper_model: Optional[WhisperModel] = None
_diarization_pipeline: Optional[Pipeline] = None

SUPPORTED_LLM_PROVIDERS = {"openai", "anthropic", "gemini", "deepseek"}
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"

class LLMHeaders(BaseModel):
    provider: str
    model: str
    api_key: str


def normalize_provider(provider: str) -> str:
    return provider.strip().lower()


async def get_llm_headers(
    x_llm_provider: str = Header(..., alias="X-LLM-Provider"),
    x_llm_model: str = Header(..., alias="X-LLM-Model"),
    x_llm_api_key: str = Header(..., alias="X-LLM-Api-Key")
) -> LLMHeaders:
    if not x_llm_provider or not x_llm_model or not x_llm_api_key:
        raise HTTPException(400, "Missing LLM credentials")
    provider = normalize_provider(x_llm_provider)
    if provider not in SUPPORTED_LLM_PROVIDERS:
        raise HTTPException(400, f"Unsupported LLM provider: {provider}")
    return LLMHeaders(provider=provider, model=x_llm_model.strip(), api_key=x_llm_api_key.strip())


async def get_stt_api_key(
    x_stt_api_key: Optional[str] = Header(None, alias="X-STT-Api-Key"),
    x_llm_provider: str = Header(..., alias="X-LLM-Provider"),
    x_llm_api_key: str = Header(..., alias="X-LLM-Api-Key")
) -> str:
    if x_stt_api_key:
        return x_stt_api_key
    if normalize_provider(x_llm_provider) == "openai":
        return x_llm_api_key
    raise HTTPException(400, "OpenAI STT key required until local STT is enabled")

# Pydantic
class SettingsInput(BaseModel):
    preferred_provider: Optional[str] = None
    preferred_model: Optional[str] = None

class SessionCreate(BaseModel):
    title: str
    target_role: Optional[str] = None
    job_description: Optional[str] = None

class SessionUpdate(BaseModel):
    status: Optional[str] = None
    duration_seconds: Optional[int] = None

class ProcessAudioInput(BaseModel):
    session_id: str
    audio_data: str
    mime_type: str


class ProfileBuildInput(BaseModel):
    job_description: str
    company_name: str
    target_role: Optional[str] = None


class ProfileSearchInput(BaseModel):
    query: str
    k: Optional[int] = 5

# Helpers
def ser(doc):
    if doc is None:
        return None
    d = dict(doc)
    d["id"] = str(d.pop("_id"))
    return d

def ser_list(docs):
    return [ser(d) for d in docs]

def now_utc():
    return datetime.now(timezone.utc).isoformat()

MAX_SESSIONS = 10

async def llm_chat(
    llm: LLMHeaders,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.5,
    max_tokens: int = 300,  # CRITICAL: Reduced from 1500 to prevent crashes
    timeout_s: float = 30.0,
    top_p: float = 0.9
) -> str:
    if llm.provider == "deepseek":
        client = AsyncOpenAI(api_key=llm.api_key, base_url=DEEPSEEK_BASE_URL, timeout=timeout_s)
        resp = await client.chat.completions.create(
            model=llm.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
            stream=False
        )
        return resp.choices[0].message.content

    chat = LlmChat(
        api_key=llm.api_key,
        session_id=str(uuid.uuid4()),
        system_message=system_prompt
    ).with_model(llm.provider, llm.model).with_params(
        temperature=temperature,
        max_tokens=max_tokens,
        top_p=top_p
    )
    return await chat.send_message(UserMessage(text=user_prompt))


async def llm_chat_fast(
    llm: LLMHeaders,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 300  # CRITICAL: Reduced from 900
) -> str:
    return await llm_chat(
        llm,
        system_prompt,
        user_prompt,
        temperature=0.3,
        max_tokens=max_tokens,
        timeout_s=20.0,
        top_p=0.9
    )

async def whisper_fast(stt_api_key, audio_bytes, mime_type):
    """Optimized Whisper: auto-detect language, reduced timeout."""
    ext_map = {"audio/webm": "webm", "audio/wav": "wav", "audio/mp3": "mp3",
               "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/m4a": "m4a"}
    ext = ext_map.get(mime_type, "webm")
    headers = {"Authorization": f"Bearer {stt_api_key}"}
    files = {"file": (f"audio.{ext}", io.BytesIO(audio_bytes), mime_type)}
    data = {"model": "whisper-1", "response_format": "verbose_json"}
    
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.post("https://api.openai.com/v1/audio/transcriptions", 
                         headers=headers, files=files, data=data)
        if r.status_code != 200:
            return {"error": r.text}
        res = r.json()
        return {
            "text": res.get("text", ""), 
            "language": res.get("language", "unknown"), 
            "duration": res.get("duration", 0)
        }

# ========== ENHANCED CV PARSING ==========

CV_PARSE_PROMPT = """Tu es un expert RH senior. Extrais TOUTES les informations de ce CV de manière EXHAUSTIVE.

RÈGLE CRITIQUE: Tu dois parcourir TOUTES les pages du document et extraire TOUTES les expériences professionnelles, même celles situées à la fin du document.

RÉPONDS EN JSON VALIDE UNIQUEMENT:
{
  "full_name": "nom complet",
  "email": "email ou null",
  "phone": "téléphone ou null",
  "location": "ville/région ou null",
  "linkedin": "url linkedin ou null",
  "summary": "résumé professionnel détaillé (3-4 phrases)",
  "current_role": "poste actuel ou dernier poste",
  "years_experience": "nombre estimé",
  "seniority": "junior|mid|senior|lead|executive",
  "experiences": [
    {
      "title": "titre du poste",
      "company": "entreprise",
      "duration": "période (ex: 2020-2023)",
      "duration_months": 36,
      "location": "lieu",
      "description": "contexte et mission principale",
      "key_achievements": ["réalisation quantifiée 1", "réalisation 2", "réalisation 3", "...TOUTES les réalisations"],
      "technologies_used": ["tech1", "tech2"]
    }
  ],
  "skills_hard": ["compétence technique 1", "compétence 2"],
  "skills_soft": ["compétence comportementale 1"],
  "technologies": ["technologie/outil 1", "tech 2"],
  "methodologies": ["agile", "scrum", "etc"],
  "education": [
    {"degree": "diplôme", "institution": "école", "year": "année", "field": "domaine"}
  ],
  "certifications": ["certification 1"],
  "languages_spoken": [{"language": "français", "level": "natif"}, {"language": "anglais", "level": "courant"}],
  "strengths": ["point fort professionnel 1", "point fort 2", "point fort 3"],
  "unique_value": "ce qui rend ce candidat unique (1 phrase)",
  "career_trajectory": "progression de carrière observée",
  "industries": ["secteur d'activité 1", "secteur 2"]
}

RÈGLES STRICTES:
- PARCOURS TOUTES LES PAGES DU DOCUMENT (le texte contient des marqueurs [PAGE X])
- Extrais TOUTES les expériences professionnelles, de la plus récente à la plus ancienne
- NE T'ARRÊTE PAS après les premières expériences - continue jusqu'à la FIN du document
- Pour chaque expérience: inclus TOUTES les réalisations mentionnées
- Quantifie quand possible (%, chiffres, équipes gérées)
- Si un champ n'existe pas, mets null ou []
- NE JAMAIS renvoyer un JSON vide ou incomplet
- LE NOMBRE D'EXPÉRIENCES DOIT CORRESPONDRE AU CONTENU RÉEL DU CV"""


def safe_json_loads(raw_text: str) -> Optional[Dict]:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(cleaned)
    except Exception:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(cleaned[start:end + 1])
            except Exception:
                return None
    return None


# ========== STREAMING AUDIO HELPERS ==========

@dataclass
class StreamingSession:
    session_id: str
    sample_rate: int = 16000
    buffer: deque = field(default_factory=deque)
    buffer_samples: int = 0
    last_transcript: str = ""
    last_transcribe_ts: float = 0.0
    last_request: str = ""
    last_speaker: str = "unknown"
    diarization_ts: float = 0.0
    speaker_map: Dict[str, str] = field(default_factory=dict)
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o"
    llm_api_key: str = ""


    def append_audio(self, samples: np.ndarray):
        self.buffer.append(samples)
        self.buffer_samples += len(samples)
        max_samples = self.sample_rate * WHISPER_WINDOW_SECONDS
        while self.buffer_samples > max_samples and self.buffer:
            removed = self.buffer.popleft()
            self.buffer_samples -= len(removed)

    def get_audio_window(self) -> Optional[np.ndarray]:
        if self.buffer_samples < int(self.sample_rate * WHISPER_MIN_SECONDS):
            return None
        return np.concatenate(list(self.buffer))


def get_whisper_model() -> WhisperModel:
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = WhisperModel(
            WHISPER_MODEL_SIZE,
            device="cpu",
            compute_type=WHISPER_COMPUTE_TYPE
        )
    return _whisper_model


def get_diarization_pipeline() -> Optional[Pipeline]:
    global _diarization_pipeline
    if not ENABLE_DIARIZATION:
        return None
    if _diarization_pipeline is None:
        token = os.environ.get("HUGGINGFACE_TOKEN")
        if not token:
            return None
        _diarization_pipeline = Pipeline.from_pretrained(
            os.environ.get("PYANNOTE_MODEL", "pyannote/speaker-diarization-3.1"),
            use_auth_token=token
        )
    return _diarization_pipeline


def decode_audio_chunk(chunk_b64: str) -> np.ndarray:
    audio_bytes = base64.b64decode(chunk_b64)
    audio = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
    return audio / 32768.0


def detect_request(text: str) -> bool:
    """
    Detect if the text is a genuine question/request requiring a response.
    Filters out small talk, background noise, and non-questions.
    """
    lowered = text.lower().strip()
    
    # Filter out very short segments (likely noise)
    words = lowered.split()
    if len(words) < 3:
        return False
    
    # Filter out common small talk / fillers (don't trigger suggestions)
    small_talk_patterns = [
        "okay", "ok", "alright", "right", "got it", "i see", "mmm", "hmm",
        "yes", "yeah", "no", "nope", "thank you", "thanks", "bonjour", "hello",
        "d'accord", "oui", "non", "merci", "bien", "super", "parfait",
        "let me", "wait", "one second", "excuse me", "sorry",
        "un instant", "attendez", "pardon", "excusez"
    ]
    
    # Check if the entire text is just small talk
    for pattern in small_talk_patterns:
        if lowered == pattern or lowered.rstrip("!.,?") == pattern:
            return False
    
    # Direct questions (ends with ?)
    if lowered.endswith("?"):
        return True
    
    # Question word triggers (French + English)
    question_starters = [
        # English
        "what", "why", "how", "when", "where", "who", "which", "could you",
        "can you", "would you", "do you", "tell me", "explain", "describe",
        "walk me through", "give me", "share", "elaborate",
        # French
        "qu'est-ce", "pourquoi", "comment", "quand", "où", "qui", "quel",
        "pouvez-vous", "pourriez-vous", "dites-moi", "expliquez", "décrivez",
        "parlez-moi", "racontez", "présentez"
    ]
    
    for starter in question_starters:
        if lowered.startswith(starter) or f" {starter}" in lowered:
            return True
    
    # Indirect requests / invitations to elaborate (English + French)
    indirect_triggers = [
        "i'd like to know", "i'm curious", "interested in", "wondering",
        "please tell", "please explain", "could you elaborate",
        "j'aimerais savoir", "je suis curieux", "intéressé par",
        "parlez-moi de", "dites-moi comment"
    ]
    
    for trigger in indirect_triggers:
        if trigger in lowered:
            return True
    
    return False


def calculate_confidence(text: str) -> float:
    """Calculate confidence score for a detected question (0.0 to 1.0)"""
    lowered = text.lower().strip()
    confidence = 0.0
    
    # Explicit question mark = high confidence
    if lowered.endswith("?"):
        confidence += 0.6
    
    # Question words
    question_words = ["what", "why", "how", "when", "where", "who", "which",
                      "qu'est-ce", "pourquoi", "comment", "quand", "où", "qui", "quel"]
    for word in question_words:
        if word in lowered:
            confidence += 0.3
            break
    
    # Length bonus (longer = more likely to be a real question)
    words = len(lowered.split())
    if words >= 5:
        confidence += 0.1
    if words >= 10:
        confidence += 0.1
    
    return min(confidence, 1.0)


CONFIDENCE_THRESHOLD = 0.5  # Only trigger suggestions if confidence >= 0.5


 


JD_ANALYSIS_PROMPT = """Tu es un recruteur senior. Analyse cette description de poste pour un entretien.
Retourne STRICTEMENT un JSON avec les champs:
- summary: résumé concis du poste
- requirements: liste des exigences clés
- keywords: mots-clés techniques et métiers
- potential_questions: questions probables de l'intervieweur
"""

COMPANY_RESEARCH_PROMPT = """Tu es un analyste marché. En te basant sur les extraits de recherche, fournis un résumé clair.
Retourne STRICTEMENT un JSON avec les champs:
- summary: aperçu global (culture, mission, produits)
- recent_news: liste de faits ou nouvelles récentes si disponibles
- competitors: liste des concurrents probables
"""


async def extract_cv_text(buf, mime):
    """Extrait le texte de TOUTES les pages du PDF sans limitation."""
    if mime == "application/pdf":
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(io.BytesIO(buf))
            all_pages_text = []
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text() or ""
                all_pages_text.append(f"[PAGE {i+1}]\n{page_text}")
            full_text = "\n\n".join(all_pages_text)
            print(f"[CV EXTRACT] {len(reader.pages)} pages extraites, {len(full_text)} caractères")
            return full_text  # PAS DE LIMITE - tout le texte
        except Exception as e:
            print(f"[CV EXTRACT ERROR] {e}")
            return ""
    elif mime == "text/plain":
        return buf.decode("utf-8", errors="ignore")
    return ""

async def parse_cv_llm(llm: LLMHeaders, raw_text: str):
    """Parse le CV avec GPT - SANS LIMITE de texte pour extraire TOUTES les expériences."""
    if not raw_text or len(raw_text.strip()) < 20:
        return {"raw_text": raw_text}
    
    # Calculer le nombre de pages si présent
    page_count = raw_text.count("[PAGE")
    print(f"[CV PARSE] Texte brut: {len(raw_text)} caractères, ~{page_count} pages détectées")
    
    try:
        # Envoyer TOUT le texte (jusqu'à 30000 caractères pour GPT-4o-mini)
        # GPT-4o-mini supporte ~128k tokens en entrée
        user_prompt = f"CV COMPLET à analyser ({page_count} pages):\n\n{raw_text[:50000]}"
        content = await llm_chat(
            llm,
            CV_PARSE_PROMPT,
            user_prompt,
            temperature=0.2,
            max_tokens=4000,
            timeout_s=90.0
        )
        parsed = safe_json_loads(content)
        if parsed:
            parsed["raw_text"] = raw_text
            parsed["parse_quality"] = "complete"
            parsed["pages_parsed"] = page_count
            
            exp_count = len(parsed.get("experiences", []))
            print(f"[CV PARSE] Succès: {exp_count} expériences extraites")
            
            return parsed

        retry_prompt = f"CV (extrait):\n{raw_text[:20000]}"
        retry_content = await llm_chat(
            llm,
            CV_PARSE_PROMPT + "\nRéponds uniquement en JSON valide.",
            retry_prompt,
            temperature=0.1,
            max_tokens=2500,
            timeout_s=60.0
        )
        retry_parsed = safe_json_loads(retry_content)
        if retry_parsed:
            retry_parsed["raw_text"] = raw_text
            retry_parsed["parse_quality"] = "complete"
            retry_parsed["pages_parsed"] = page_count
            
            exp_count = len(retry_parsed.get("experiences", []))
            print(f"[CV PARSE] Succès après retry: {exp_count} expériences extraites")
            
            return retry_parsed

        return {
            "parse_quality": "failed",
            "raw_excerpt": raw_text[:2000],
            "full_name": "",
            "current_role": "",
            "contact": {"email": "", "phone": "", "location": ""},
            "skills_hard": [],
            "skills_soft": [],
            "experiences": [],
            "education": [],
            "projects": [],
            "certifications": [],
            "languages": []
        }
    except Exception as e:
        print(f"[CV PARSE ERROR] {e}")
        return {"raw_text": raw_text, "parse_quality": "failed"}

def build_cv_context_rich(cv_data):
    """Build rich CV context for suggestions - uses ALL parsed data."""
    if not cv_data:
        return ""
    
    parts = []
    
    # Identity
    if cv_data.get("full_name"):
        parts.append(f"CANDIDAT: {cv_data['full_name']}")
    if cv_data.get("current_role"):
        parts.append(f"POSTE: {cv_data['current_role']}")
    if cv_data.get("years_experience"):
        parts.append(f"EXPÉRIENCE: {cv_data['years_experience']} ans")
    if cv_data.get("seniority"):
        parts.append(f"NIVEAU: {cv_data['seniority']}")
    
    # Summary
    if cv_data.get("summary"):
        parts.append(f"PROFIL: {cv_data['summary']}")
    if cv_data.get("unique_value"):
        parts.append(f"VALEUR UNIQUE: {cv_data['unique_value']}")
    
    # TOUTES LES EXPÉRIENCES (sans limite) - EXPLORATION EXHAUSTIVE
    if cv_data.get("experiences"):
        parts.append("\n=== PARCOURS PROFESSIONNEL COMPLET (à explorer intégralement) ===")
        for i, e in enumerate(cv_data["experiences"], 1):
            exp_block = []
            exp_block.append(f"\n[EXPÉRIENCE {i}] {e.get('title', '')} @ {e.get('company', '')} ({e.get('duration', '')})")
            if e.get('location'):
                exp_block.append(f"  Lieu: {e.get('location')}")
            if e.get('description'):
                exp_block.append(f"  Contexte: {e.get('description')}")
            if e.get("key_achievements"):
                exp_block.append("  RÉALISATIONS CLÉS:")
                for ach in e["key_achievements"]:  # TOUTES les réalisations, pas de limite
                    exp_block.append(f"    • {ach}")
            if e.get("technologies_used"):
                exp_block.append(f"  Technologies utilisées: {', '.join(e['technologies_used'])}")
            parts.append("\n".join(exp_block))
        parts.append("=== FIN DU PARCOURS - SÉLECTIONNER L'EXPÉRIENCE LA PLUS PERTINENTE ===\n")
    
    # Skills
    if cv_data.get("skills_hard"):
        parts.append(f"COMPÉTENCES TECHNIQUES: {', '.join(cv_data['skills_hard'][:20])}")
    if cv_data.get("skills_soft"):
        parts.append(f"SOFT SKILLS: {', '.join(cv_data['skills_soft'][:10])}")
    if cv_data.get("technologies"):
        parts.append(f"TECHNOLOGIES: {', '.join(cv_data['technologies'][:20])}")
    if cv_data.get("methodologies"):
        parts.append(f"MÉTHODOLOGIES: {', '.join(cv_data['methodologies'][:8])}")
    
    # Strengths
    if cv_data.get("strengths"):
        parts.append(f"POINTS FORTS: {', '.join(cv_data['strengths'][:6])}")
    
    # Education & Certifications
    if cv_data.get("education"):
        edu = [f"{e.get('degree', '')} - {e.get('institution', '')}" for e in cv_data["education"][:3]]
        parts.append(f"FORMATION: {'; '.join(edu)}")
    if cv_data.get("certifications"):
        parts.append(f"CERTIFICATIONS: {', '.join(cv_data['certifications'][:5])}")
    
    # Languages
    if cv_data.get("languages_spoken"):
        langs = [f"{l.get('language', '')} ({l.get('level', '')})" for l in cv_data["languages_spoken"]]
        parts.append(f"LANGUES: {', '.join(langs)}")
    
    # Industries
    if cv_data.get("industries"):
        parts.append(f"SECTEURS: {', '.join(cv_data['industries'][:5])}")
    
    # Fallback to raw text
    if not parts and cv_data.get("raw_text"):
        parts.append(f"CV (texte):\n{cv_data['raw_text'][:3000]}")
    
    return "\n".join(parts)

# ========== STREAMING PIPELINE ==========

async def update_speaker_from_diarization(session: StreamingSession, audio_window: np.ndarray):
    pipeline = get_diarization_pipeline()
    if not pipeline:
        return

    try:
        waveform = torch.from_numpy(audio_window).unsqueeze(0)
        diarization = await asyncio.to_thread(
            pipeline,
            {"waveform": waveform, "sample_rate": session.sample_rate}
        )
    except Exception as exc:
        print(f"[DIARIZATION] error: {exc}")
        return

    speaker_durations: Dict[str, float] = {}
    for segment, _, speaker in diarization.itertracks(yield_label=True):
        speaker_durations[speaker] = speaker_durations.get(speaker, 0.0) + segment.duration

    if not speaker_durations:
        return

    for speaker, _ in sorted(speaker_durations.items(), key=lambda item: item[1], reverse=True):
        if speaker not in session.speaker_map:
            if "interviewer" not in session.speaker_map.values():
                session.speaker_map[speaker] = "interviewer"
            else:
                session.speaker_map[speaker] = "candidate"

    main_speaker = max(speaker_durations.items(), key=lambda item: item[1])[0]
    session.last_speaker = session.speaker_map.get(main_speaker, session.last_speaker)


async def stream_llm_suggestions(
    websocket: WebSocket,
    llm_provider: str,
    llm_model: str,
    llm_api_key: str,
    question: str,
    context: str
):
    if not llm_api_key or not llm_model:
        return

    suggestion_id = str(uuid.uuid4())
    await websocket.send_json({"type": "suggestion_start", "id": suggestion_id})

    system_prompt = (
        "Tu es un copilote d'entretien. Fournis 2-3 suggestions de réponse professionnelles, "
        "structurées et concises, adaptées au contexte fourni."
    )
    user_prompt = f"Question: {question}\n\nContexte:\n{context}"

    if llm_provider in {"openai", "deepseek"}:
        base_url = DEEPSEEK_BASE_URL if llm_provider == "deepseek" else None
        client = AsyncOpenAI(api_key=llm_api_key, base_url=base_url)
        stream = await client.chat.completions.create(
            model=llm_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.4,
            max_tokens=300,  # CRITICAL: Limit to 300 tokens to prevent crashes
            stream=True
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                await websocket.send_json({"type": "suggestion_delta", "id": suggestion_id, "text": delta})
    else:
        llm_headers = LLMHeaders(provider=llm_provider, model=llm_model, api_key=llm_api_key)
        content = await llm_chat(
            llm_headers,
            system_prompt,
            user_prompt,
            temperature=0.4,
            max_tokens=300,  # CRITICAL: Limit to 300 tokens
            timeout_s=30.0
        )
        await websocket.send_json({"type": "suggestion_delta", "id": suggestion_id, "text": content})

    await websocket.send_json({"type": "suggestion_end", "id": suggestion_id})


async def transcribe_and_send(websocket: WebSocket, session: StreamingSession, audio_window: np.ndarray):
    model = get_whisper_model()
    segments, info = await asyncio.to_thread(
        model.transcribe,
        audio_window,
        language=None,
        vad_filter=True
    )

    transcript = " ".join(seg.text.strip() for seg in segments).strip()
    if not transcript:
        return

    if transcript.startswith(session.last_transcript):
        delta = transcript[len(session.last_transcript):].strip()
    else:
        delta = transcript

    if not delta:
        return

    session.last_transcript = transcript
    speaker = session.last_speaker
    if speaker == "unknown":
        speaker = "interviewer" if detect_request(transcript) else "candidate"

    await websocket.send_json({
        "type": "transcript",
        "text": transcript,
        "delta": delta,
        "speaker": speaker
    })

    if detect_request(transcript) and transcript != session.last_request:
        session.last_request = transcript
        context_docs = search_profile_context(transcript, k=5)
        context_text = "\n".join(doc["text"] for doc in context_docs if doc.get("text"))
        if context_text:
            context_text = "Contexte CV/JD:\n" + context_text
        asyncio.create_task(
            stream_llm_suggestions(
                websocket,
                session.llm_provider,
                session.llm_model,
                session.llm_api_key,
                transcript,
                context_text
            )
        )

    if ENABLE_DIARIZATION and time.time() - session.diarization_ts > DIARIZATION_INTERVAL:
        session.diarization_ts = time.time()
        asyncio.create_task(update_speaker_from_diarization(session, audio_window))


# ========== INGESTION HELPERS ==========

async def duckduckgo_search(query: str, max_results: int = 8) -> str:
    url = "https://api.duckduckgo.com/"
    params = {
        "q": query,
        "format": "json",
        "no_html": 1,
        "skip_disambig": 1
    }
    try:
        async with httpx.AsyncClient(timeout=12.0) as c:
            resp = await c.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        print(f"[DUCKDUCKGO] error: {exc}")
        return ""

    snippets = []
    if data.get("AbstractText"):
        snippets.append(data["AbstractText"])

    for item in data.get("Results", [])[:max_results]:
        text = item.get("Text")
        if text:
            snippets.append(text)

    for item in data.get("RelatedTopics", [])[:max_results]:
        if isinstance(item, dict) and item.get("Text"):
            snippets.append(item["Text"])
        elif isinstance(item, dict) and item.get("Topics"):
            for sub in item.get("Topics", [])[:max_results]:
                if sub.get("Text"):
                    snippets.append(sub["Text"])

    return "\n".join(snippets)


async def analyze_job_description(llm: LLMHeaders, job_description: str, role_context: str) -> Dict:
    user_prompt = f"ROLE CONTEXT:\n{role_context}\n\nJOB DESCRIPTION:\n{job_description}"
    try:
        content = await llm_chat(
            llm,
            JD_ANALYSIS_PROMPT,
            user_prompt,
            temperature=0.2,
            max_tokens=1200,
            timeout_s=60.0
        )
        parsed = safe_json_loads(content)
        if parsed:
            return parsed
    except Exception as exc:
        print(f"[JD ANALYSIS] error: {exc}")
        return {
            "summary": job_description[:400],
            "requirements": [],
            "keywords": [],
            "potential_questions": []
        }


async def summarize_company_research(llm: LLMHeaders, company_name: str, search_text: str) -> Dict:
    if not search_text:
        return {"summary": "", "recent_news": [], "competitors": []}

    user_prompt = f"COMPANY: {company_name}\n\nSEARCH SNIPPETS:\n{search_text}"
    try:
        content = await llm_chat(
            llm,
            COMPANY_RESEARCH_PROMPT,
            user_prompt,
            temperature=0.2,
            max_tokens=900,
            timeout_s=60.0
        )
        parsed = safe_json_loads(content)
        if parsed:
            return parsed
    except Exception as exc:
        print(f"[COMPANY SUMMARY] error: {exc}")
        return {"summary": search_text[:600], "recent_news": [], "competitors": []}


def build_profile_documents(cv_doc: Dict, jd_analysis: Dict, company_summary: Dict, job_description: str) -> List[Dict]:
    docs = []

    def add_doc(text: str, source: str, title: str):
        if text:
            docs.append({"text": text, "source": source, "title": title})

    parsed = cv_doc.get("parsed_data") or {}
    add_doc(parsed.get("summary") or parsed.get("profile_summary"), "resume", "Résumé")

    skills = parsed.get("skills") or parsed.get("skills_hard") or []
    if isinstance(skills, list):
        skills_text = ", ".join(skills)
    else:
        skills_text = str(skills)
    add_doc(skills_text, "resume", "Compétences")

    experiences = parsed.get("experience") or parsed.get("experiences") or []
    for exp in experiences[:10]:
        if isinstance(exp, dict):
            title = exp.get("title") or exp.get("role") or "Expérience"
            company = exp.get("company") or exp.get("employer") or ""
            summary = exp.get("summary") or exp.get("description") or ""
            achievements = exp.get("achievements") or []
            achievements_text = ""
            if isinstance(achievements, list):
                achievements_text = " | ".join(achievements[:3])
            else:
                achievements_text = str(achievements)
            text = f"{title} chez {company}. {summary} {achievements_text}".strip()
            add_doc(text, "resume", f"Expérience: {title}")

    add_doc(job_description, "job_description", "Job description")
    add_doc(jd_analysis.get("summary"), "job_description", "Synthèse JD")

    if jd_analysis.get("requirements"):
        reqs = jd_analysis.get("requirements")
        if isinstance(reqs, list):
            add_doc("Exigences: " + ", ".join(reqs), "job_description", "Exigences")

    if jd_analysis.get("keywords"):
        keywords = jd_analysis.get("keywords")
        if isinstance(keywords, list):
            add_doc("Mots-clés: " + ", ".join(keywords), "job_description", "Mots-clés")

    company_text = company_summary.get("summary") if isinstance(company_summary, dict) else None
    add_doc(company_text, "company", "Company summary")

    if isinstance(company_summary, dict):
        if company_summary.get("recent_news"):
            news = company_summary.get("recent_news")
            if isinstance(news, list):
                add_doc("Actualités: " + "; ".join(news), "company", "Actualités")
        if company_summary.get("competitors"):
            competitors = company_summary.get("competitors")
            if isinstance(competitors, list):
                add_doc("Concurrents: " + ", ".join(competitors), "company", "Concurrents")

    if not docs and cv_doc.get("raw_text"):
        add_doc(cv_doc["raw_text"][:2000], "resume", "CV brut")

    return docs



# ========== ENHANCED SMALL TALK FILTER ==========

SMALL_TALK_PATTERNS_FR = {
    # Greetings
    "bonjour", "bonsoir", "salut", "coucou", "hello", "hey",
    # Farewells
    "au revoir", "à bientôt", "bonne journée", "bonne soirée", "à plus",
    # Thanks
    "merci", "merci beaucoup", "je vous remercie",
    # Acknowledgments
    "d'accord", "ok", "okay", "très bien", "parfait", "super", "entendu", "compris",
    "bien sûr", "absolument", "effectivement", "tout à fait", "c'est noté",
    # Politeness
    "je vous en prie", "pas de souci", "pas de problème", "avec plaisir",
    "excusez-moi", "pardon",
    # Fillers/admin
    "un instant", "une seconde", "attendez", "je note", "je vais noter",
    "laissez-moi", "voyons", "alors", "donc", "bon",
    # Hesitations
    "hmm", "euh", "heu", "ah", "oh",
}

SMALL_TALK_PATTERNS_EN = {
    # Greetings
    "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
    # Farewells
    "goodbye", "bye", "see you", "take care", "have a good day",
    # Thanks
    "thank you", "thanks", "thanks a lot", "much appreciated",
    # Acknowledgments
    "okay", "ok", "alright", "sure", "perfect", "great", "got it", "understood",
    "absolutely", "exactly", "indeed", "noted", "i see",
    # Politeness
    "you're welcome", "no problem", "no worries", "my pleasure",
    "excuse me", "sorry",
    # Fillers/admin
    "one moment", "one second", "hold on", "let me", "let me note",
    "let me see", "so", "well", "right",
    # Hesitations
    "hmm", "uh", "um", "ah", "oh",
}

COMMENT_PATTERNS = {
    # French comment indicators
    "je vois", "intéressant", "c'est bien", "d'après ce que", "si je comprends bien",
    "en effet", "justement", "notamment",
    # English comment indicators  
    "i see", "interesting", "that's good", "from what i", "if i understand",
    "indeed", "exactly", "right",
}

def is_small_talk_or_comment(text: str) -> tuple[bool, str]:
    """
    Filter ONLY pure small talk. Be CONSERVATIVE - when in doubt, let it through to GPT.
    Returns (is_filtered, reason).
    """
    clean = text.strip().lower()
    clean_no_punct = clean.rstrip(".!?,;:…")
    
    # Very short = likely filler (but not if it ends with ?)
    if len(clean_no_punct) < 4 and "?" not in text:
        return True, "too_short"
    
    # ONLY exact match small talk (be strict here)
    if clean_no_punct in SMALL_TALK_PATTERNS_FR or clean_no_punct in SMALL_TALK_PATTERNS_EN:
        return True, "small_talk"
    
    # Short phrases starting with small talk (but ONLY if very short)
    if len(clean_no_punct) < 20:
        for pattern in ["bonjour", "bonsoir", "merci", "hello", "hi", "thanks", "thank you"]:
            if clean_no_punct == pattern or clean_no_punct.startswith(pattern + " ") and len(clean_no_punct) < len(pattern) + 10:
                return True, "small_talk_prefix"
    
    # Do NOT filter anything else - let GPT decide
    return False, ""

def has_question_markers(text: str, lang: str) -> bool:
    """Check if text contains question indicators."""
    clean = text.strip().lower()
    
    # Question mark
    if "?" in text:
        return True
    
    # French question starters
    fr_starters = ["comment", "pourquoi", "qu'est-ce", "quel", "quelle", "quels", "quelles",
                   "où", "quand", "combien", "est-ce que", "pouvez-vous", "pourriez-vous",
                   "parlez-moi", "décrivez", "expliquez", "racontez", "dites-moi"]
    
    # English question starters
    en_starters = ["how", "why", "what", "which", "where", "when", "who", "whom",
                   "can you", "could you", "would you", "tell me", "describe",
                   "explain", "walk me through", "give me"]
    
    starters = fr_starters if lang == "fr" else en_starters
    for starter in starters:
        if clean.startswith(starter) or f" {starter}" in clean:
            return True
    
    # Imperative forms (requests)
    imperatives_fr = ["présentez", "détaillez", "donnez", "montrez", "citez"]
    imperatives_en = ["present", "detail", "give", "show", "list", "name"]
    imperatives = imperatives_fr if lang == "fr" else imperatives_en
    
    for imp in imperatives:
        if imp in clean:
            return True
    
    return False

# ========== PROMPT COPILOTE D'ENTRETIEN EXPERT V2 ==========

COPILOT_SYSTEM_PROMPT = """# IDENTITÉ ET RÔLE
Tu es un copilote d'entretien expert, spécialisé dans l'assistance en temps réel. Tu aides un candidat à répondre aux questions d'un recruteur avec précision, crédibilité et profondeur variable selon les besoins.

Métaphore : Tu es un stratège silencieux qui chuchote des conseils précis – jamais un remplaçant qui prend la parole.

# RÈGLES FONDAMENTALES (INVIOLABLES)

## Règle #1 : Extensibilité obligatoire
❌ INTERDIT : Réponses "fermées" sans possibilité d'approfondissement
✅ OBLIGATOIRE : Chaque suggestion contient des "points d'entrée" pour détailler

## Règle #2 : Ancrage CV systématique
❌ INTERDIT : Exemples génériques, théories abstraites, réponses "livre scolaire"
✅ OBLIGATOIRE : Citer au moins UN élément concret du CV :
- "Dans votre expérience chez [Entreprise]..."
- "Comme vous l'avez fait sur le projet [Nom]..."
- "Votre gestion de [situation précise] illustre..."

## Règle #3 : EXPLORATION EXHAUSTIVE DU CV (CRITIQUE)
❌ INTERDIT : Se limiter aux expériences récentes ou aux premières du CV
✅ OBLIGATOIRE : Parcourir TOUTES les expériences (anciennes ET récentes) et sélectionner LA PLUS PERTINENTE pour la question, indépendamment de l'ancienneté.

MÉCANISME D'EXTRACTION CV:
1. Parcours TOUTES les expériences, de la plus ancienne à la plus récente
2. Évalue la pertinence de CHAQUE expérience par rapport à la question
3. NE TE LAISSE PAS BIAISER par l'ordre chronologique
4. Une expérience de 2022 peut être PLUS PERTINENTE qu'une de 2024
5. Privilégie l'expérience avec l'exemple le plus concret (chiffres, situations, défis)

EXEMPLE:
Question: "Avez-vous géré une crise client ?"
CV: VOLT 2024 (projet classique) vs BFORBANK 2023 (vraie crise client)
✅ SÉLECTIONNER BFORBANK même si plus ancien
❌ NE PAS se contenter de VOLT sous prétexte qu'il est récent

## Règle #4 : Non-redondance stricte
❌ INTERDIT : Répéter la même information reformulée
✅ OBLIGATOIRE : Chaque échange apporte une couche d'information nouvelle

# ARCHITECTURE DES RÉPONSES

## NIVEAU 1 - RÉPONSE INITIALE (rapide)
Format en 3 temps :
1. **Accroche** : Reformulation implicite montrant la compréhension
2. **Cœur** : 2-3 points clés actionnables immédiatement  
3. **Ouverture** : Indice subtil qu'on peut approfondir

## NIVEAU 2 - APPROFONDISSEMENT
Déclencheurs : "Pouvez-vous préciser...", "Concrètement...", "Par exemple ?", "Comment avez-vous fait ?"

Processus :
1. Identifier l'angle précis demandé
2. SCANNER TOUT LE CV pour sélectionner l'expérience LA PLUS PERTINENTE (pas forcément la plus récente)
3. Construire avec : Contexte → Action → Résultat → Lien question

# MÉTHODE PAIR (questions complexes)
- **P**roblème : Reformulation + vrais enjeux
- **A**nalyse : Contraintes, paramètres
- **I**mplémentation : Solution + compromis (avec exemples du CV entier)
- **R**ésultats : Impacts attendus

# GESTION DES PIÈGES

**Question bateau** ("Qualités ?") → Illustrer par situations concrètes (puiser dans TOUT le CV)
**Relance** ("Concrètement ?") → Niveau 2 avec ancrage CV (expérience la plus pertinente, même ancienne)
**Biais de récence** → NE PAS toujours citer la dernière expérience, la pertinence PRIME

# MÉTRIQUES QUALITÉ (vérifier AVANT chaque réponse)
□ Cette réponse est-elle personnalisée ?
□ Y a-t-il un point d'entrée pour approfondir ?
□ Ai-je exploré TOUTES les expériences du CV, y compris les plus anciennes ?
□ L'expérience choisie est-elle vraiment la PLUS PERTINENTE ou juste la plus récente ?

# TON ET STYLE
- Conseiller stratégique, pas de formules toutes faites
- Précis sans être lourd
- Calme et confiant
- Adaptatif au style du recruteur

# DÉTECTION D'INTENTION
DÉCLENCHE (d:1) : questions, demandes, invitations, impératifs, intentions implicites
NE DÉCLENCHE PAS (d:0) : politesse pure courte ("Bonjour", "Merci", "D'accord")
DANS LE DOUTE → d:1

# FORMAT JSON OBLIGATOIRE
{"d":1,"l":"fr|en","c":"tech|behav|exp|motiv|scen|pitch|gen","q":"intention","r":"suggestion avec ancrage CV (expérience la plus pertinente, pas forcément récente)","k":["point1","point2"],"t":"conseil"}
ou {"d":0}

# ENGAGEMENT FINAL
Tu t'engages à ne JAMAIS négliger une expérience sous prétexte qu'elle est ancienne. Le parcours COMPLET du candidat est une mine d'or – extrais les pépites les plus brillantes pour chaque question."""

# Prompt de détection d'intention (plus léger, pour flux rapide)
INTENT_DETECTION_RULES = """
DÉCLENCHE (d:1) : questions, demandes, invitations, impératifs, intentions implicites
IGNORE (d:0) : "Bonjour", "Merci", "D'accord", "Je note" (politesse pure courte)
DOUTE → d:1
"""

async def fast_analyze_v3(llm: LLMHeaders, transcript, session_id, cv_data, detected_lang, prev_lang):
    """
    Copilote d'entretien expert - Analyse en flux continu.
    - Détection d'intentions dans la parole naturelle
    - Ancrage CV systématique
    - Suggestions extensibles avec points d'entrée
    """
    cv_ctx = build_cv_context_rich(cv_data)
    
    # Get conversation context (last 3 user messages for flow understanding)
    recent_user = await messages_col.find(
        {"session_id": session_id, "role": "user", "is_small_talk": {"$ne": True}}
    ).sort("created_at", -1).limit(3).to_list(length=3)
    recent_user.reverse()

    # Get last AI suggestion for non-redundancy check
    last_ai = await messages_col.find_one(
        {"session_id": session_id, "role": "assistant"},
        sort=[("created_at", -1)]
    )
    last_suggestion = last_ai.get("content", "")[:200] if last_ai else ""
    
    context_parts = [m["content"][:120] for m in recent_user]
    conversation_flow = " → ".join(context_parts) if context_parts else "Début de conversation"
    
    # PROFIL CV COMPLET - pas de troncation pour permettre l'exploration exhaustive
    profile = cv_ctx if cv_ctx else "CV non chargé - utiliser des réponses génériques structurées"
    
    # Build comprehensive user message
    user_msg = f"""# LANGUE DE RÉPONSE: {detected_lang.upper()}

# PROFIL COMPLET DU CANDIDAT (EXPLORER TOUTES LES EXPÉRIENCES)
{profile}

# FLUX DE CONVERSATION
{conversation_flow}

# DERNIÈRE SUGGESTION IA (pour éviter répétition)
{last_suggestion if last_suggestion else "Aucune suggestion précédente"}

# CE QUE LE RECRUTEUR DIT MAINTENANT
"{transcript}"

RAPPEL: Parcours TOUTES les expériences ci-dessus et sélectionne LA PLUS PERTINENTE, pas forcément la plus récente.
Génère une suggestion structurée (Accroche + Cœur + Ouverture) avec ancrage CV obligatoire."""
    
    try:
        content = await llm_chat_fast(
            llm,
            COPILOT_SYSTEM_PROMPT,
            user_msg,
            max_tokens=900
        )
        result = safe_json_loads(content)
        if not result:
            return {"detected": False}
        
        # Flexible detection check
        detected = result.get("d") in [1, True, "1", "true", 1.0]
        if not detected:
            return {"detected": False}
        
        response_lang = result.get("l", detected_lang)
        
        cat_map = {
            "tech": "question_technique", "behav": "question_comportementale",
            "exp": "question_experience", "motiv": "question_motivation",
            "scen": "mise_en_situation", "pitch": "presentation", "gen": "general"
        }
        
        return {
            "detected": True,
            "category": cat_map.get(result.get("c", "gen"), "general"),
            "question_summary": result.get("q", ""),
            "suggested_response": result.get("r", ""),
            "key_points": result.get("k", []),
            "tone_advice": result.get("t", ""),
            "response_language": response_lang,
            "confidence": 0.95
        }
    except json.JSONDecodeError as e:
        print(f"[COPILOT] JSON error: {e}")
        # Try to extract response even if JSON is malformed
        try:
            if '"r":' in content:
                import re
                match = re.search(r'"r"\s*:\s*"([^"]+)"', content)
                if match:
                    return {
                        "detected": True,
                        "category": "general",
                        "question_summary": transcript[:50],
                        "suggested_response": match.group(1),
                        "key_points": [],
                        "tone_advice": "",
                        "response_language": detected_lang,
                        "confidence": 0.7
                    }
        except:
            pass
        return {"detected": False}
    except Exception as e:
        print(f"[COPILOT] Error: {e}")
        raise

# WebSocket streaming endpoint
@app.websocket("/api/ws/stream")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    session: Optional[StreamingSession] = None
    try:
        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type")

            if msg_type == "start":
                session_id = message.get("session_id") or str(uuid.uuid4())
                llm_provider = normalize_provider(message.get("llm_provider", "openai"))
                llm_model = message.get("llm_model", "gpt-4o")
                llm_api_key = message.get("llm_api_key", "")
                sample_rate = int(message.get("sample_rate", 16000))

                session = StreamingSession(
                    session_id=session_id,
                    sample_rate=sample_rate,
                    llm_provider=llm_provider if llm_provider in SUPPORTED_LLM_PROVIDERS else "openai",
                    llm_model=llm_model,
                    llm_api_key=llm_api_key
                )
                await websocket.send_json({"type": "ready", "session_id": session_id})
                continue

            if msg_type == "audio_chunk" and session:
                chunk_b64 = message.get("audio")
                if not chunk_b64:
                    continue
                samples = decode_audio_chunk(chunk_b64)
                session.append_audio(samples)

                now = time.time()
                if now - session.last_transcribe_ts >= TRANSCRIBE_INTERVAL:
                    session.last_transcribe_ts = now
                    audio_window = session.get_audio_window()
                    if audio_window is not None:
                        asyncio.create_task(transcribe_and_send(websocket, session, audio_window))
                continue

            if msg_type == "stop":
                await websocket.send_json({"type": "stopped"})
                break
    except WebSocketDisconnect:
        return
    except Exception as exc:
        print(f"[WS STREAM] error: {exc}")
        try:
            await websocket.close()
        except Exception:
            pass

 

# ========== API ENDPOINTS ==========

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0"}

# Settings
@app.get("/api/settings")
async def get_settings():
    return {
        "server_storage": False,
        "preferred_provider": None,
        "preferred_model": None,
        "has_key": False
    }

@app.post("/api/settings")
async def save_settings(data: SettingsInput):
    return {"success": True, "server_storage": False}

@app.post("/api/settings/validate-key")
async def validate_key():
    return {"valid": False, "error": "Validation handled client-side"}

# CV
@app.get("/api/cv/active")
async def get_active_cv():
    cv = await cv_col.find_one({"is_active": True}, sort=[("created_at", -1)])
    if not cv:
        return None
    doc = ser(cv)
    doc.pop("file_data", None)
    return doc

@app.post("/api/cv/upload")
async def upload_cv(
    file: UploadFile = File(...),
    llm: LLMHeaders = Depends(get_llm_headers)
):

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 5MB)")
    mime = file.content_type or "application/pdf"
    raw_text = await extract_cv_text(content, mime)
    parsed_data = await parse_cv_llm(llm, raw_text)
    await cv_col.update_many({"is_active": True}, {"$set": {"is_active": False}})
    cv_id = str(uuid.uuid4())
    doc = {
        "_id": cv_id,
        "file_name": file.filename, "mime_type": mime,
        "file_data": base64.b64encode(content).decode("utf-8"),
        "parsed_data": parsed_data, "raw_text": raw_text,
        "is_active": True, "created_at": now_utc()
    }
    await cv_col.insert_one(doc)
    invalidate_cv_cache()
    doc["id"] = cv_id
    doc.pop("_id", None)
    doc.pop("file_data", None)
    return doc

@app.delete("/api/cv/{cv_id}")
async def delete_cv(cv_id: str):
    await cv_col.delete_one({"_id": cv_id})
    invalidate_cv_cache()
    return {"success": True}

@app.post("/api/cv/reparse")
async def reparse_cv(llm: LLMHeaders = Depends(get_llm_headers)):
    """Re-parse the active CV using enhanced LLM parsing with FULL text."""
    cv = await cv_col.find_one({"is_active": True})
    if not cv:
        raise HTTPException(404, "Aucun CV actif")
    
    # Check if we have the original file data to re-extract
    file_data_b64 = cv.get("file_data")
    mime_type = cv.get("mime_type", "application/pdf")
    
    if file_data_b64:
        # Re-extract text from original file WITHOUT limits
        file_bytes = base64.b64decode(file_data_b64)
        raw_text = await extract_cv_text(file_bytes, mime_type)
        print(f"[REPARSE] Re-extracted {len(raw_text)} chars from original file")
    else:
        raw_text = cv.get("raw_text", "")
        print(f"[REPARSE] Using existing raw_text: {len(raw_text)} chars")
    
    if not raw_text or len(raw_text.strip()) < 20:
        raise HTTPException(400, "CV sans contenu texte extractible")
    
    # Parse with FULL text
    parsed_data = await parse_cv_llm(llm, raw_text)
    
    # Update both raw_text and parsed_data
    await cv_col.update_one(
        {"_id": cv["_id"]}, 
        {"$set": {"parsed_data": parsed_data, "raw_text": raw_text}}
    )
    invalidate_cv_cache()
    
    doc = ser(cv)
    doc["parsed_data"] = parsed_data
    doc.pop("file_data", None)
    return doc

class CVUrlInput(BaseModel):
    url: str

@app.post("/api/cv/upload-from-url")
async def upload_cv_from_url(
    data: CVUrlInput,
    llm: LLMHeaders = Depends(get_llm_headers)
):
    """Upload CV from URL - extracts ALL pages without limits."""
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.get(data.url)
            if r.status_code != 200:
                raise HTTPException(400, f"Impossible de télécharger le fichier: {r.status_code}")
            content = r.content
    except Exception as e:
        raise HTTPException(400, f"Erreur de téléchargement: {e}")
    
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 10MB)")
    
    # Detect mime type
    mime = "application/pdf" if data.url.lower().endswith(".pdf") else "application/octet-stream"
    
    # Extract ALL text from ALL pages
    raw_text = await extract_cv_text(content, mime)
    print(f"[CV URL UPLOAD] Extracted {len(raw_text)} chars")
    
    # Parse with GPT
    parsed_data = await parse_cv_llm(llm, raw_text)
    
    # Deactivate old CVs
    await cv_col.update_many({"is_active": True}, {"$set": {"is_active": False}})
    
    # Save new CV
    cv_id = str(uuid.uuid4())
    doc = {
        "_id": cv_id,
        "file_name": data.url.split("/")[-1],
        "mime_type": mime,
        "file_data": base64.b64encode(content).decode("utf-8"),
        "parsed_data": parsed_data,
        "raw_text": raw_text,
        "is_active": True,
        "created_at": now_utc()
    }
    await cv_col.insert_one(doc)
    invalidate_cv_cache()
    
    doc["id"] = cv_id
    doc.pop("_id", None)
    doc.pop("file_data", None)
    return doc


# Ingestion & Vector Profile
@app.post("/api/ingestion/build-profile")
async def build_profile(
    data: ProfileBuildInput,
    llm: LLMHeaders = Depends(get_llm_headers)
):
    if not data.job_description.strip():
        raise HTTPException(400, "Job description requis")
    if not data.company_name.strip():
        raise HTTPException(400, "Nom d'entreprise requis")

    cv_doc = await cv_col.find_one({"is_active": True})
    if not cv_doc:
        raise HTTPException(404, "CV actif introuvable")

    role_context = get_role_template(data.target_role)
    jd_analysis = await analyze_job_description(llm, data.job_description, role_context)

    search_text = await duckduckgo_search(data.company_name)
    company_summary = await summarize_company_research(llm, data.company_name, search_text)

    documents = build_profile_documents(cv_doc, jd_analysis, company_summary, data.job_description)
    if not documents:
        raise HTTPException(400, "Aucun document à indexer")

    meta = {
        "company_name": data.company_name,
        "job_description": data.job_description,
        "target_role": data.target_role,
        "jd_analysis": jd_analysis,
        "company_summary": company_summary
    }
    profile_meta = save_profile_index(documents, meta)

    profile_id = str(uuid.uuid4())
    await profiles_col.insert_one({
        "_id": profile_id,
        "company_name": data.company_name,
        "job_description": data.job_description,
        "target_role": data.target_role,
        "doc_count": profile_meta.get("doc_count", 0),
        "created_at": now_utc()
    })

    return {
        "profile_id": profile_id,
        "doc_count": profile_meta.get("doc_count", 0),
        "jd_analysis": jd_analysis,
        "company_summary": company_summary
    }


@app.get("/api/ingestion/status")
async def ingestion_status():
    if not profile_index_exists():
        return {"available": False, "doc_count": 0}
    meta = load_profile_meta() or {}
    return {
        "available": True,
        "doc_count": meta.get("doc_count", 0),
        "created_at": meta.get("created_at")
    }


@app.post("/api/ingestion/search")
async def ingestion_search(data: ProfileSearchInput):
    matches = search_profile_context(data.query, data.k or 5)
    return {"matches": matches}


@app.post("/api/ingestion/clear-cache")
async def ingestion_clear_cache():
    removed = clear_profile_cache()
    await profiles_col.delete_many({})
    return {"cleared": True, "removed_files": removed}


# Sessions
@app.get("/api/sessions")
async def list_sessions():
    sessions = await sessions_col.find({}).sort("created_at", -1).to_list(length=100)
    return ser_list(sessions)

@app.get("/api/sessions/stats")
async def session_stats():
    sessions = await sessions_col.find({}).to_list(length=100)
    total_q = sum(s.get("total_questions", 0) for s in sessions)
    total_dur = sum(s.get("duration_seconds", 0) for s in sessions)
    lats = [s.get("avg_latency_ms", 0) for s in sessions if s.get("avg_latency_ms")]
    return {
        "total_questions": total_q,
        "avg_latency": round(sum(lats) / len(lats)) if lats else 0,
        "total_duration": total_dur,
        "total_sessions": len(sessions)
    }

@app.post("/api/sessions")
async def create_session(data: SessionCreate):
    count = await sessions_col.count_documents({})
    if count >= MAX_SESSIONS:
        raise HTTPException(403, f"Limite de {MAX_SESSIONS} sessions atteinte")
    session_id = str(uuid.uuid4())
    doc = {
        "_id": session_id,
        "title": data.title,
        "target_role": data.target_role,
        "job_description": data.job_description,
        "status": "active",
        "total_questions": 0, "total_responses": 0,
        "avg_latency_ms": 0, "duration_seconds": 0,
        "latency_samples": [],
        "created_at": now_utc(), "updated_at": now_utc()
    }
    await sessions_col.insert_one(doc)
    doc["id"] = session_id
    doc.pop("_id", None)
    return doc

@app.put("/api/sessions/{session_id}")
async def update_session(session_id: str, data: SessionUpdate):
    update = {"updated_at": now_utc()}
    if data.status:
        update["status"] = data.status
    if data.duration_seconds is not None:
        update["duration_seconds"] = data.duration_seconds
    await sessions_col.update_one({"_id": session_id}, {"$set": update})
    return {"success": True}

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    await messages_col.delete_many({"session_id": session_id})
    await sessions_col.delete_one({"_id": session_id})
    # Clean session language cache
    _session_lang.pop(session_id, None)
    return {"success": True}

@app.get("/api/sessions/{session_id}/messages")
async def get_messages(session_id: str):
    msgs = await messages_col.find({"session_id": session_id}).sort("created_at", 1).to_list(length=1000)
    return ser_list(msgs)

# ========== MAIN PIPELINE: ULTRA-OPTIMIZED (target ≤2s, ideal ~1s) ==========

@app.post("/api/interview/process-audio")
async def process_audio(
    data: ProcessAudioInput,
    llm: LLMHeaders = Depends(get_llm_headers),
    stt_api_key: str = Depends(get_stt_api_key)
):
    t0 = time.time()
    
    # Start CV fetch in parallel with session check
    cv_task = asyncio.create_task(get_cached_cv())
    
    session = await sessions_col.find_one({"_id": data.session_id})
    if not session:
        raise HTTPException(404, "Session non trouvée")
    
    # Get previous language for this session (for ambiguity fallback)
    prev_lang = get_session_lang(data.session_id)
    
    # 1. Whisper transcription (auto-detect language)
    audio_bytes = base64.b64decode(data.audio_data)
    t1 = time.time()
    tr = await whisper_fast(stt_api_key, audio_bytes, data.mime_type)
    whisper_ms = int((time.time() - t1) * 1000)
    
    if "error" in tr:
        print(f"[WHISPER ERR] {tr['error'][:150]}")
        return {"detected": False, "error": "transcription_failed", "pipeline_ms": int((time.time() - t0) * 1000)}
    
    transcript_text = (tr.get("text") or "").strip()
    detected_lang = tr.get("language", "unknown")
    
    # Normalize language
    if detected_lang in ("french", "fr"):
        detected_lang = "fr"
    elif detected_lang in ("english", "en"):
        detected_lang = "en"
    else:
        # Fallback to previous session language if detection unclear
        detected_lang = prev_lang
    
    # Update session language
    set_session_lang(data.session_id, detected_lang)
    
    if not transcript_text or len(transcript_text) < 3:
        return {"detected": False, "detected_language": detected_lang, "pipeline_ms": int((time.time() - t0) * 1000)}
    
    # 2. Enhanced small talk / comment filter (saves ~1-2s by skipping GPT)
    is_filtered, filter_reason = is_small_talk_or_comment(transcript_text)
    
    if is_filtered:
        # Still save for transcript
        await messages_col.insert_one({
            "_id": str(uuid.uuid4()),
            "session_id": data.session_id, "role": "user",
            "content": transcript_text, "detected_language": detected_lang,
            "is_small_talk": True, "filter_reason": filter_reason,
            "whisper_ms": whisper_ms, "created_at": now_utc()
        })
        print(f"[SKIP] {filter_reason}: '{transcript_text[:40]}' ({whisper_ms}ms)")
        return {
            "detected": False, "filtered": filter_reason, 
            "detected_language": detected_lang, 
            "pipeline_ms": int((time.time() - t0) * 1000)
        }
    
    # 3. Check for question markers (additional validation)
    has_question = has_question_markers(transcript_text, detected_lang)
    
    # 4. Save transcribed text (for end-of-session summary)
    await messages_col.insert_one({
        "_id": str(uuid.uuid4()),
        "session_id": data.session_id, "role": "user",
        "content": transcript_text, "detected_language": detected_lang,
        "has_question_markers": has_question,
        "whisper_ms": whisper_ms, "created_at": now_utc()
    })
    
    # 5. Get CV from cache (should be ready by now)
    cv_data = await cv_task
    
    # 6. Fast analyze + generate suggestion (V3 - flux conversationnel)
    t2 = time.time()
    try:
        analysis = await fast_analyze_v3(
            llm, transcript_text, data.session_id,
            cv_data, detected_lang, prev_lang
        )
    except Exception as e:
        print(f"[ANALYZE ERR] {e}")
        return {
            "detected": False, "error": "analysis_failed", 
            "detected_language": detected_lang, 
            "pipeline_ms": int((time.time() - t0) * 1000)
        }
    
    analysis_ms = int((time.time() - t2) * 1000)
    pipeline_ms = int((time.time() - t0) * 1000)
    
    detected = analysis.get("detected", False)
    print(f"[PIPE] '{transcript_text[:40]}' lang={detected_lang} det={detected} w={whisper_ms}ms a={analysis_ms}ms T={pipeline_ms}ms")
    
    if detected:
        ai_response = analysis.get("suggested_response", "")
        category = analysis.get("category", "general")
        key_points = analysis.get("key_points", [])
        tone_advice = analysis.get("tone_advice", "")
        question_summary = analysis.get("question_summary", "")
        response_lang = analysis.get("response_language", detected_lang)
        
        await messages_col.insert_one({
            "_id": str(uuid.uuid4()),
            "session_id": data.session_id, "role": "assistant",
            "content": ai_response, "category": category,
            "key_points": key_points, "tone_advice": tone_advice,
            "question_summary": question_summary,
            "response_language": response_lang,
            "response_ms": analysis_ms, "created_at": now_utc()
        })
        
        # Update session stats with latency sample
        await sessions_col.update_one(
            {"_id": data.session_id},
            {
                "$inc": {"total_questions": 1, "total_responses": 1},
                "$push": {"latency_samples": {"$each": [pipeline_ms], "$slice": -20}},
                "$set": {"updated_at": now_utc()}
            }
        )
        
        return {
            "detected": True, "category": category, "confidence": 0.95,
            "question_summary": question_summary, "suggested_response": ai_response,
            "key_points": key_points, "tone_advice": tone_advice,
            "detected_language": detected_lang, "response_language": response_lang,
            "response_ms": analysis_ms, "pipeline_ms": pipeline_ms, 
            "cv_active": cv_data is not None
        }
    
    return {"detected": False, "detected_language": detected_lang, "pipeline_ms": pipeline_ms}

# ========== ROBUST SESSION SUMMARY ==========

SUMMARY_PROMPT_V2 = """Expert analyse entretiens. Analyse cette session et produis un résumé structuré.

Messages "RECRUTEUR" = ce que l'intervieweur a dit
Messages "SUGGESTION" = réponses suggérées par l'IA

JSON OUTPUT:
{
  "transcript": [
    {"speaker": "recruteur", "text": "...", "language": "fr|en"},
    {"speaker": "suggestion_ia", "text": "..."}
  ],
  "identified_questions": [
    {"question": "...", "category": "technique|comportementale|experience|motivation|scenario|presentation|general", "context": "bref contexte"}
  ],
  "qa_pairs": [
    {"question": "question du recruteur", "suggested_answer": "réponse IA", "category": "..."}
  ],
  "session_insights": {
    "total_exchanges": 0,
    "questions_detected": 0,
    "dominant_category": "catégorie la plus fréquente",
    "languages_used": ["fr", "en"],
    "avg_response_time_ms": 0,
    "general_feedback": "feedback constructif 2-3 phrases"
  },
  "key_topics": ["thème 1", "thème 2"],
  "improvement_suggestions": ["suggestion 1"]
}

RÈGLES:
- Reconstitue TOUTE la conversation chronologiquement
- Identifie TOUTES les questions du recruteur
- Associe chaque question à sa suggestion quand elle existe
- Feedback bienveillant et constructif
- Si données manquantes, utiliser des valeurs par défaut plutôt que d'échouer"""

@app.post("/api/sessions/{session_id}/generate-summary")
async def generate_summary(
    session_id: str,
    llm: LLMHeaders = Depends(get_llm_headers)
):
    
    session = await sessions_col.find_one({"_id": session_id})
    if not session:
        raise HTTPException(404, "Session non trouvée")
    
    msgs = await messages_col.find({"session_id": session_id}).sort("created_at", 1).to_list(length=1000)
    
    # Handle empty session gracefully
    if not msgs:
        fallback_summary = {
            "transcript": [],
            "identified_questions": [],
            "qa_pairs": [],
            "session_insights": {
                "total_exchanges": 0,
                "questions_detected": 0,
                "dominant_category": "none",
                "languages_used": [],
                "avg_response_time_ms": 0,
                "general_feedback": "Session sans échanges enregistrés."
            },
            "key_topics": [],
            "improvement_suggestions": ["Assurez-vous que le micro fonctionne correctement pour la prochaine session."]
        }
        await sessions_col.update_one(
            {"_id": session_id},
            {"$set": {"summary": fallback_summary, "status": "completed", "updated_at": now_utc()}}
        )
        return fallback_summary
    
    # Build conversation
    lines = []
    latencies = []
    for m in msgs:
        if m.get("is_small_talk"):
            continue
        role_label = "RECRUTEUR" if m["role"] == "user" else "SUGGESTION"
        lang = m.get("detected_language", "")
        lang_tag = f" [{lang.upper()}]" if lang else ""
        lines.append(f"{role_label}{lang_tag}: {m['content']}")
        if m.get("response_ms"):
            latencies.append(m["response_ms"])
    
    conversation = "\n\n".join(lines) if lines else "Session vide"
    avg_latency = round(sum(latencies) / len(latencies)) if latencies else 0
    


    try:
        user_prompt = f"Session d'entretien:\n\n{conversation}\n\nLatence moyenne: {avg_latency}ms"
        content = await llm_chat(
            llm,
            SUMMARY_PROMPT_V2,
            user_prompt,
            temperature=0.4,
            max_tokens=3000,
            timeout_s=60.0
        )
        summary = safe_json_loads(content)
        if not summary:
            summary = create_fallback_summary(msgs, avg_latency)
        
        # Inject actual avg latency
        if "session_insights" in summary:
            summary["session_insights"]["avg_response_time_ms"] = avg_latency
            
    except json.JSONDecodeError as e:
        print(f"[SUMMARY JSON ERROR] {e}")
        # Fallback: create minimal summary from raw data
        summary = create_fallback_summary(msgs, avg_latency)
    except Exception as e:
        print(f"[SUMMARY ERROR] {e}")
        summary = create_fallback_summary(msgs, avg_latency)
    
    await sessions_col.update_one(
        {"_id": session_id},
        {"$set": {"summary": summary, "status": "completed", "updated_at": now_utc()}}
    )
    
    return summary

def create_fallback_summary(msgs, avg_latency):
    """Create degraded but non-empty summary when LLM fails."""
    transcript = []
    questions = []
    qa_pairs = []
    languages = set()
    
    last_user_msg = None
    for m in msgs:
        if m.get("is_small_talk"):
            continue
        
        lang = m.get("detected_language", "unknown")
        languages.add(lang)
        
        if m["role"] == "user":
            transcript.append({"speaker": "recruteur", "text": m["content"], "language": lang})
            last_user_msg = m["content"]
        else:
            transcript.append({"speaker": "suggestion_ia", "text": m["content"]})
            if last_user_msg:
                questions.append({
                    "question": last_user_msg[:100],
                    "category": m.get("category", "general"),
                    "context": ""
                })
                qa_pairs.append({
                    "question": last_user_msg,
                    "suggested_answer": m["content"],
                    "category": m.get("category", "general")
                })
                last_user_msg = None
    
    return {
        "transcript": transcript,
        "identified_questions": questions,
        "qa_pairs": qa_pairs,
        "session_insights": {
            "total_exchanges": len(transcript),
            "questions_detected": len(questions),
            "dominant_category": "general",
            "languages_used": list(languages),
            "avg_response_time_ms": avg_latency,
            "general_feedback": "Résumé généré automatiquement. Session terminée."
        },
        "key_topics": [],
        "improvement_suggestions": []
    }

@app.get("/api/sessions/{session_id}/summary")
async def get_summary(session_id: str):
    session = await sessions_col.find_one({"_id": session_id})
    if not session:
        raise HTTPException(404, "Session non trouvée")
    summary = session.get("summary")
    if not summary:
        return None
    return summary
