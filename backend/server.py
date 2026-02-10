from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
import json
import base64
import io
import time
from datetime import datetime, timezone
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import httpx

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "interview_ai")

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

settings_col = db["user_settings"]
cv_col = db["cv_documents"]
sessions_col = db["interview_sessions"]
messages_col = db["conversation_messages"]

# Pydantic
class SettingsInput(BaseModel):
    openai_api_key: Optional[str] = None
    preferred_model: Optional[str] = "gpt-4o-mini"

class SessionCreate(BaseModel):
    title: str
    target_role: Optional[str] = None
    job_description: Optional[str] = None

class SessionUpdate(BaseModel):
    status: Optional[str] = None
    duration_seconds: Optional[int] = None

class ProcessAudioInput(BaseModel):
    session_id: str
    audio_data: str  # base64 encoded
    mime_type: str
    language: Optional[str] = "fr"

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
CONTEXT_SIZE = 8

async def get_api_key():
    s = await settings_col.find_one({"user_id": "default"}, {"_id": 0})
    if not s or not s.get("openai_api_key"):
        return None
    return s["openai_api_key"]

async def openai_chat(api_key, messages, model="gpt-4o-mini", json_mode=False):
    payload = {"model": model, "messages": messages, "temperature": 0.6, "max_tokens": 2000}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.post("https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload)
        if r.status_code != 200:
            raise HTTPException(r.status_code, f"OpenAI: {r.text}")
        return r.json()["choices"][0]["message"]["content"]

async def whisper(api_key, audio_bytes, mime_type, language=None):
    ext_map = {"audio/webm": "webm", "audio/wav": "wav", "audio/mp3": "mp3",
               "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/m4a": "m4a"}
    ext = ext_map.get(mime_type, "webm")
    headers = {"Authorization": f"Bearer {api_key}"}
    files = {"file": (f"audio.{ext}", io.BytesIO(audio_bytes), mime_type)}
    data = {"model": "whisper-1", "response_format": "verbose_json"}
    if language:
        data["language"] = language
    async with httpx.AsyncClient(timeout=120.0) as c:
        r = await c.post("https://api.openai.com/v1/audio/transcriptions", headers=headers, files=files, data=data)
        if r.status_code != 200:
            return {"error": r.text}
        res = r.json()
        return {"text": res.get("text", ""), "language": res.get("language", "unknown"), "duration": res.get("duration", 0)}

# CV helpers
async def extract_cv_text(buf, mime):
    if mime == "application/pdf":
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(io.BytesIO(buf))
            return "".join(p.extract_text() or "" for p in reader.pages)[:12000]
        except Exception:
            return ""
    elif mime == "text/plain":
        return buf.decode("utf-8", errors="ignore")[:12000]
    return ""

async def parse_cv_llm(api_key, raw_text):
    if not raw_text or len(raw_text.strip()) < 20:
        return {"raw_text": raw_text}
    prompt = """Tu es un expert RH. Extrais les informations structurées de ce CV.
Réponds UNIQUEMENT en JSON valide:
{
  "full_name": "string ou null",
  "email": "string ou null",
  "summary": "résumé professionnel court",
  "current_role": "poste actuel ou dernier poste",
  "years_experience": "nombre d'années estimé",
  "experiences": [{"title": "string", "company": "string", "duration": "string", "key_achievements": ["réalisation1"]}],
  "skills": ["compétence1"],
  "technologies": ["tech1"],
  "education": [{"degree": "string", "institution": "string"}],
  "languages": ["langue1"],
  "certifications": ["cert1"],
  "strengths": ["point fort professionnel 1"]
}
IMPORTANT: Extrais le MAXIMUM d'informations. Si un champ n'est pas trouvé, mets une liste vide ou null. Ne renvoie jamais un JSON vide."""
    try:
        content = await openai_chat(api_key,
            [{"role": "system", "content": prompt}, {"role": "user", "content": f"Voici le CV à analyser:\n\n{raw_text[:8000]}"}],
            json_mode=True)
        parsed = json.loads(content)
        parsed["raw_text"] = raw_text
        return parsed
    except Exception as e:
        print(f"CV parse error: {e}")
        return {"raw_text": raw_text}

def build_cv_context(cv_data):
    if not cv_data:
        return ""
    parts = []
    if cv_data.get("full_name"):
        parts.append(f"Candidat: {cv_data['full_name']}")
    if cv_data.get("current_role"):
        parts.append(f"Poste actuel: {cv_data['current_role']}")
    if cv_data.get("years_experience"):
        parts.append(f"Expérience: {cv_data['years_experience']} ans")
    if cv_data.get("summary"):
        parts.append(f"Profil: {cv_data['summary']}")
    if cv_data.get("experiences"):
        exp_lines = []
        for e in cv_data["experiences"][:4]:
            line = f"- {e.get('title', '')} @ {e.get('company', '')} ({e.get('duration', '')})"
            if e.get("key_achievements"):
                line += ": " + "; ".join(e["key_achievements"][:2])
            exp_lines.append(line)
        parts.append("Parcours:\n" + "\n".join(exp_lines))
    if cv_data.get("skills"):
        parts.append(f"Compétences clés: {', '.join(cv_data['skills'][:15])}")
    if cv_data.get("technologies"):
        parts.append(f"Technologies: {', '.join(cv_data['technologies'][:15])}")
    if cv_data.get("strengths"):
        parts.append(f"Points forts: {', '.join(cv_data['strengths'][:5])}")
    if cv_data.get("certifications"):
        parts.append(f"Certifications: {', '.join(cv_data['certifications'][:5])}")
    # Fallback: if structured data is empty but raw text exists, use raw text excerpt
    if not parts and cv_data.get("raw_text"):
        parts.append(f"CV (texte brut):\n{cv_data['raw_text'][:3000]}")
    return "\n".join(parts)

# Question analysis + response in one call (faster pipeline)
ANALYSIS_AND_RESPONSE_PROMPT = """Tu es un assistant d'entretien d'embauche intelligent.
Tu assistes un candidat en TEMPS RÉEL pendant son entretien.

RÔLE:
1. Analyse ce que l'interlocuteur (recruteur/interviewer) vient de dire
2. Détermine s'il y a une question, une demande, ou un sujet qui nécessite une réponse du candidat
3. Si oui, génère une suggestion de réponse personnalisée basée sur le profil du candidat

CATÉGORIES DE DÉTECTION:
- "question_technique" : Question sur compétences techniques, technologies, architecture
- "question_comportementale" : Question sur soft skills, gestion conflits, leadership
- "question_experience" : Demande de détails sur le parcours, projets passés
- "question_motivation" : Pourquoi ce poste, cette entreprise, objectifs carrière
- "mise_en_situation" : Scénario hypothétique à résoudre
- "presentation" : Demande de se présenter, pitch personnel
- "none" : Pas de question/demande identifiée (simple commentaire, transition)

Réponds TOUJOURS en JSON:
{
  "detected": true/false,
  "category": "string",
  "confidence": 0.0-1.0,
  "question_summary": "reformulation concise de la question/demande",
  "suggested_response": "réponse suggérée personnalisée (3-5 phrases, structurée, professionnelle)",
  "key_points": ["point clé 1 à mentionner", "point clé 2"],
  "tone_advice": "conseil sur le ton à adopter"
}

INSTRUCTIONS POUR LA RÉPONSE SUGGÉRÉE:
- Utilise les informations du CV du candidat pour personnaliser
- Structure avec: accroche + développement + conclusion
- Pour les questions comportementales, utilise la méthode STAR
- Sois naturel, pas robotique
- Mentionne des exemples concrets tirés de l'expérience du candidat
- Si aucune question n'est détectée, detected=false et les autres champs sont null"""

async def analyze_and_respond(api_key, transcript, session_id, cv_data, model, language):
    cv_ctx = build_cv_context(cv_data)

    # Get conversation history
    recent = await messages_col.find({"session_id": session_id}).sort("created_at", -1).limit(CONTEXT_SIZE).to_list(length=CONTEXT_SIZE)
    recent.reverse()
    history_lines = []
    for m in recent:
        role_label = "RECRUTEUR" if m["role"] == "user" else "SUGGESTION"
        history_lines.append(f"{role_label}: {m['content']}")
    history = "\n".join(history_lines) if history_lines else "(début de l'entretien)"

    profile_section = f"PROFIL DU CANDIDAT:\n{cv_ctx}" if cv_ctx else "PROFIL: Non renseigné (répondre de manière générique)"

    user_msg = f"""{profile_section}

HISTORIQUE DE CONVERSATION:
{history}

NOUVEAU MESSAGE DE L'INTERLOCUTEUR:
\"{transcript}\"

Langue de réponse: {"français" if language == "fr" else "anglais"}"""

    content = await openai_chat(api_key,
        [{"role": "system", "content": ANALYSIS_AND_RESPONSE_PROMPT},
         {"role": "user", "content": user_msg}],
        model=model, json_mode=True)
    return json.loads(content)

# ============ API ENDPOINTS ============

@app.get("/api/health")
async def health():
    return {"status": "ok"}

# Settings
@app.get("/api/settings")
async def get_settings():
    s = await settings_col.find_one({"user_id": "default"}, {"_id": 0})
    if not s:
        return {"openai_api_key": None, "preferred_model": "gpt-4o-mini", "has_key": False}
    key = s.get("openai_api_key")
    masked = ("sk-..." + key[-4:]) if key and len(key) > 4 else None
    return {"openai_api_key": masked, "preferred_model": s.get("preferred_model", "gpt-4o-mini"), "has_key": bool(key)}

@app.post("/api/settings")
async def save_settings(data: SettingsInput):
    update = {"user_id": "default", "updated_at": now_utc()}
    if data.openai_api_key is not None:
        update["openai_api_key"] = data.openai_api_key if data.openai_api_key else None
    if data.preferred_model:
        update["preferred_model"] = data.preferred_model
    await settings_col.update_one({"user_id": "default"}, {"$set": update}, upsert=True)
    return {"success": True}

@app.post("/api/settings/validate-key")
async def validate_key(data: SettingsInput):
    if not data.openai_api_key:
        return {"valid": False, "error": "Clé manquante"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get("https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {data.openai_api_key}"})
            return {"valid": r.status_code == 200, "error": None if r.status_code == 200 else "Clé invalide"}
    except Exception:
        return {"valid": False, "error": "Erreur de connexion"}

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
async def upload_cv(file: UploadFile = File(...)):
    api_key = await get_api_key()
    if not api_key:
        raise HTTPException(400, "Clé API non configurée")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 5MB)")
    mime = file.content_type or "application/pdf"
    raw_text = await extract_cv_text(content, mime)
    parsed_data = await parse_cv_llm(api_key, raw_text)
    await cv_col.update_many({"is_active": True}, {"$set": {"is_active": False}})
    doc = {
        "file_name": file.filename, "mime_type": mime,
        "file_data": base64.b64encode(content).decode("utf-8"),
        "parsed_data": parsed_data, "raw_text": raw_text,
        "is_active": True, "created_at": now_utc()
    }
    result = await cv_col.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    doc.pop("file_data", None)
    return doc

@app.delete("/api/cv/{cv_id}")
async def delete_cv(cv_id: str):
    await cv_col.delete_one({"_id": ObjectId(cv_id)})
    return {"success": True}

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
    doc = {
        "title": data.title,
        "target_role": data.target_role,
        "job_description": data.job_description,
        "status": "active",
        "total_questions": 0, "total_responses": 0,
        "avg_latency_ms": 0, "duration_seconds": 0,
        "created_at": now_utc(), "updated_at": now_utc()
    }
    result = await sessions_col.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc

@app.put("/api/sessions/{session_id}")
async def update_session(session_id: str, data: SessionUpdate):
    update = {"updated_at": now_utc()}
    if data.status:
        update["status"] = data.status
    if data.duration_seconds is not None:
        update["duration_seconds"] = data.duration_seconds
    await sessions_col.update_one({"_id": ObjectId(session_id)}, {"$set": update})
    return {"success": True}

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    await messages_col.delete_many({"session_id": session_id})
    await sessions_col.delete_one({"_id": ObjectId(session_id)})
    return {"success": True}

@app.get("/api/sessions/{session_id}/messages")
async def get_messages(session_id: str):
    msgs = await messages_col.find({"session_id": session_id}).sort("created_at", 1).to_list(length=1000)
    return ser_list(msgs)

# Main pipeline: process audio chunk (transcribe silently, detect questions, return suggestions only)
@app.post("/api/interview/process-audio")
async def process_audio(data: ProcessAudioInput):
    t0 = time.time()
    api_key = await get_api_key()
    if not api_key:
        raise HTTPException(400, "Clé API non configurée")
    settings = await settings_col.find_one({"user_id": "default"}, {"_id": 0})
    model = (settings or {}).get("preferred_model", "gpt-4o-mini")

    session = await sessions_col.find_one({"_id": ObjectId(data.session_id)})
    if not session:
        raise HTTPException(404, "Session non trouvée")

    # Decode and transcribe audio
    audio_bytes = base64.b64decode(data.audio_data)
    t1 = time.time()
    tr = await whisper(api_key, audio_bytes, data.mime_type, data.language)
    transcription_ms = int((time.time() - t1) * 1000)

    if "error" in tr:
        return {"detected": False, "error": tr["error"], "pipeline_ms": int((time.time() - t0) * 1000)}

    transcript_text = (tr.get("text") or "").strip()
    detected_lang = tr.get("language", "fr")

    if not transcript_text or len(transcript_text) < 3:
        return {"detected": False, "pipeline_ms": int((time.time() - t0) * 1000)}

    # Save transcribed text as user message (stored for end-of-session summary)
    await messages_col.insert_one({
        "session_id": data.session_id, "role": "user",
        "content": transcript_text, "detected_language": detected_lang,
        "transcription_ms": transcription_ms, "created_at": now_utc()
    })

    # Get CV for context
    cv_doc = await cv_col.find_one({"is_active": True})
    cv_data = cv_doc.get("parsed_data") if cv_doc else None

    # Analyze: detect question + generate suggestion
    t2 = time.time()
    analysis = await analyze_and_respond(api_key, transcript_text, data.session_id, cv_data, model, detected_lang)
    response_ms = int((time.time() - t2) * 1000)

    detected = analysis.get("detected", False)
    ai_response = analysis.get("suggested_response")
    category = analysis.get("category", "none")
    key_points = analysis.get("key_points", [])
    tone_advice = analysis.get("tone_advice")
    question_summary = analysis.get("question_summary")
    confidence = analysis.get("confidence", 0)

    if detected and ai_response:
        await messages_col.insert_one({
            "session_id": data.session_id, "role": "assistant",
            "content": ai_response, "category": category,
            "key_points": key_points, "tone_advice": tone_advice,
            "question_summary": question_summary, "confidence": confidence,
            "response_ms": response_ms, "created_at": now_utc()
        })
        await sessions_col.update_one(
            {"_id": ObjectId(data.session_id)},
            {"$inc": {"total_questions": 1, "total_responses": 1}, "$set": {"updated_at": now_utc()}}
        )

    pipeline_ms = int((time.time() - t0) * 1000)

    # Return suggestion only — NO transcript in response (transcript is hidden during session)
    return {
        "detected": detected,
        "category": category,
        "confidence": confidence,
        "question_summary": question_summary,
        "suggested_response": ai_response,
        "key_points": key_points,
        "tone_advice": tone_advice,
        "response_ms": response_ms,
        "pipeline_ms": pipeline_ms,
        "cv_active": cv_data is not None
    }


# --- Session Summary (end of session) ---

SUMMARY_PROMPT = """Tu es un expert en analyse d'entretiens d'embauche.
On te fournit l'intégralité des échanges d'une session d'entretien.
Les messages "RECRUTEUR" sont ce que l'interlocuteur a dit.
Les messages "SUGGESTION" sont les réponses suggérées par l'IA.

Produis une analyse structurée en JSON:
{
  "transcript": [
    {"speaker": "recruteur", "text": "ce que le recruteur a dit"},
    {"speaker": "candidat (suggestion IA)", "text": "la réponse suggérée"}
  ],
  "identified_questions": [
    {
      "question": "la question ou demande identifiée",
      "category": "technique | comportementale | experience | motivation | mise_en_situation | presentation | general",
      "context": "contexte bref de la question dans la conversation"
    }
  ],
  "qa_pairs": [
    {
      "question": "la question du recruteur",
      "suggested_answer": "la réponse suggérée par l'IA",
      "category": "catégorie de la question"
    }
  ],
  "session_insights": {
    "total_exchanges": 0,
    "questions_detected": 0,
    "dominant_category": "catégorie la plus fréquente",
    "general_feedback": "feedback général sur la session (2-3 phrases)"
  }
}

RÈGLES:
- Reconstitue la conversation complète dans "transcript" dans l'ordre chronologique
- Identifie TOUTES les questions ou demandes du recruteur dans "identified_questions"
- Pour chaque question identifiée qui a reçu une suggestion, crée une paire dans "qa_pairs"
- Si un message du recruteur n'est pas une question, inclus-le quand même dans le transcript mais pas dans identified_questions
- Le feedback doit être constructif et bienveillant"""


@app.post("/api/sessions/{session_id}/generate-summary")
async def generate_summary(session_id: str):
    api_key = await get_api_key()
    if not api_key:
        raise HTTPException(400, "Clé API non configurée")

    session = await sessions_col.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(404, "Session non trouvée")

    # Get all messages
    msgs = await messages_col.find({"session_id": session_id}).sort("created_at", 1).to_list(length=1000)
    if not msgs:
        raise HTTPException(400, "Aucun message dans cette session")

    # Build conversation text
    lines = []
    for m in msgs:
        role_label = "RECRUTEUR" if m["role"] == "user" else "SUGGESTION"
        lines.append(f"{role_label}: {m['content']}")
    conversation = "\n\n".join(lines)

    settings = await settings_col.find_one({"user_id": "default"}, {"_id": 0})
    model = (settings or {}).get("preferred_model", "gpt-4o-mini")

    try:
        content = await openai_chat(
            api_key,
            [
                {"role": "system", "content": SUMMARY_PROMPT},
                {"role": "user", "content": f"Analyse cette session d'entretien:\n\n{conversation}"}
            ],
            model=model, json_mode=True
        )
        summary = json.loads(content)
    except Exception as e:
        raise HTTPException(500, f"Erreur de génération: {str(e)}")

    # Store summary in session
    await sessions_col.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"summary": summary, "status": "completed", "updated_at": now_utc()}}
    )

    return summary


@app.get("/api/sessions/{session_id}/summary")
async def get_summary(session_id: str):
    session = await sessions_col.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(404, "Session non trouvée")
    summary = session.get("summary")
    if not summary:
        return None
    return summary
