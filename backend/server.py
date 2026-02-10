from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import os
import json
import base64
import io
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

# Collections
settings_col = db["user_settings"]
cv_col = db["cv_documents"]
sessions_col = db["interview_sessions"]
messages_col = db["conversation_messages"]

# --- Pydantic Models ---

class SettingsInput(BaseModel):
    openai_api_key: Optional[str] = None
    preferred_model: Optional[str] = "gpt-4o-mini"

class SessionCreate(BaseModel):
    title: str

class SessionUpdate(BaseModel):
    status: Optional[str] = None
    duration_seconds: Optional[int] = None
    detected_language: Optional[str] = None
    target_role: Optional[str] = None
    job_description: Optional[str] = None

class ProcessAudioInput(BaseModel):
    session_id: str
    audio_data: str  # base64
    mime_type: str
    language: Optional[str] = None

# --- Helpers ---

def serialize_doc(doc):
    if doc is None:
        return None
    doc["id"] = str(doc.pop("_id"))
    return doc

def serialize_docs(docs):
    return [serialize_doc(d) for d in docs]

def now_utc():
    return datetime.now(timezone.utc).isoformat()

# --- Constants ---
MAX_SESSIONS = 5
MIN_TRANSCRIPT_LENGTH = 3
CONVERSATION_CONTEXT_SIZE = 5
MAX_CV_TEXT_LENGTH = 10000

# --- OpenAI Helpers ---

async def get_user_api_key():
    settings = await settings_col.find_one({"user_id": "default"}, {"_id": 0})
    if not settings or not settings.get("openai_api_key"):
        return None
    return settings["openai_api_key"]

async def call_openai_chat(api_key: str, messages: list, model: str = "gpt-4o-mini", response_format=None):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 2000
    }
    if response_format:
        payload["response_format"] = response_format

    async with httpx.AsyncClient(timeout=60.0) as client_http:
        resp = await client_http.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"OpenAI error: {resp.text}")
        return resp.json()

async def transcribe_audio(api_key: str, audio_bytes: bytes, mime_type: str, language: Optional[str] = None):
    ext_map = {
        "audio/webm": "webm", "audio/wav": "wav", "audio/mp3": "mp3",
        "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/m4a": "m4a"
    }
    ext = ext_map.get(mime_type, "webm")
    filename = f"audio.{ext}"

    headers = {"Authorization": f"Bearer {api_key}"}
    files = {"file": (filename, io.BytesIO(audio_bytes), mime_type)}
    data = {"model": "whisper-1", "response_format": "verbose_json"}
    if language:
        data["language"] = language

    async with httpx.AsyncClient(timeout=120.0) as client_http:
        resp = await client_http.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers=headers,
            files=files,
            data=data
        )
        if resp.status_code != 200:
            return {"error": f"Whisper error: {resp.text}", "code": "TRANSCRIPTION_FAILED"}
        result = resp.json()
        return {
            "text": result.get("text", ""),
            "language": result.get("language", "unknown"),
            "duration": result.get("duration", 0)
        }

# --- CV Parsing ---

async def parse_cv_text(buffer: bytes, mime_type: str) -> str:
    if mime_type == "application/pdf":
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(io.BytesIO(buffer))
            text = ""
            for page in reader.pages:
                text += page.extract_text() or ""
            return text[:MAX_CV_TEXT_LENGTH]
        except Exception:
            return ""
    elif mime_type == "text/plain":
        return buffer.decode("utf-8", errors="ignore")[:MAX_CV_TEXT_LENGTH]
    return ""

async def parse_cv_with_llm(api_key: str, raw_text: str):
    if not raw_text or len(raw_text.strip()) < 20:
        return {"raw_text": raw_text}

    system_prompt = """Tu es un expert en analyse de CV. Extrais les informations structurées du CV fourni.
Réponds UNIQUEMENT en JSON valide avec cette structure:
{
  "full_name": "string ou null",
  "email": "string ou null",
  "phone": "string ou null",
  "summary": "résumé professionnel ou null",
  "experiences": [{"title": "string", "company": "string", "duration": "string", "description": "string"}],
  "skills": ["compétence1", "compétence2"],
  "technologies": ["tech1", "tech2"],
  "education": [{"degree": "string", "institution": "string", "year": "string"}],
  "languages": ["langue1", "langue2"]
}"""

    try:
        resp = await call_openai_chat(
            api_key,
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Analyse ce CV:\n\n{raw_text}"}
            ],
            response_format={"type": "json_object"}
        )
        content = resp["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        parsed["raw_text"] = raw_text
        return parsed
    except Exception:
        return {"raw_text": raw_text}

# --- Question Analysis ---

QUESTION_DETECTION_PROMPT = """Tu es un analyseur de conversation d'entretien. Ton rôle est de déterminer si le message contient une question d'entretien.

Analyse le message et réponds en JSON:
{
  "is_question": true/false,
  "question_type": "technical" | "behavioral" | "situational" | "experience" | "motivation" | "general" | null
}

Critères pour is_question=true:
- Question directe (qui, quoi, comment, pourquoi, etc.)
- Demande d'expérience ou de compétence
- Mise en situation
- Demande d'avis ou d'opinion professionnelle"""

async def analyze_conversation(api_key: str, transcript: str, language: str, session_id: str):
    recent_messages = await messages_col.find(
        {"session_id": session_id}
    ).sort("created_at", -1).limit(CONVERSATION_CONTEXT_SIZE).to_list(length=CONVERSATION_CONTEXT_SIZE)

    context = ""
    if recent_messages:
        recent_messages.reverse()
        context = "\n".join([f"{m['role']}: {m['content']}" for m in recent_messages])

    try:
        resp = await call_openai_chat(
            api_key,
            [
                {"role": "system", "content": QUESTION_DETECTION_PROMPT},
                {"role": "user", "content": f"Contexte:\n{context}\n\nMessage:\n\"{transcript}\"\n\nLangue: {language}"}
            ],
            response_format={"type": "json_object"}
        )
        content = resp["choices"][0]["message"]["content"]
        result = json.loads(content)
        return {
            "is_question": result.get("is_question", False),
            "question_type": result.get("question_type")
        }
    except Exception:
        return {"is_question": False, "question_type": None}

# --- Response Generation ---

async def generate_response(api_key: str, question: str, question_type: str, language: str, session_id: str, cv_data=None, model: str = "gpt-4o-mini"):
    cv_context = ""
    if cv_data:
        parts = []
        if cv_data.get("full_name"):
            parts.append(f"Nom: {cv_data['full_name']}")
        if cv_data.get("summary"):
            parts.append(f"Résumé: {cv_data['summary']}")
        if cv_data.get("experiences"):
            exp = "\n".join([f"- {e['title']} chez {e['company']} ({e.get('duration', '')})" for e in cv_data["experiences"]])
            parts.append(f"Expériences:\n{exp}")
        if cv_data.get("skills"):
            parts.append(f"Compétences: {', '.join(cv_data['skills'])}")
        if cv_data.get("technologies"):
            parts.append(f"Technologies: {', '.join(cv_data['technologies'])}")
        cv_context = "\n\n".join(parts)

    # Get conversation history
    recent = await messages_col.find(
        {"session_id": session_id}
    ).sort("created_at", -1).limit(10).to_list(length=10)
    recent.reverse()
    history = "\n".join([f"{'CANDIDAT' if m['role']=='user' else 'ASSISTANT'}: {m['content']}" for m in recent])

    lang = "fr" if language == "fr" else "en"
    q_type = question_type or ("general" if lang != "fr" else "general")
    cv_section = ""
    if cv_context:
        cv_section = "PROFIL DU CANDIDAT:\n" + cv_context + "\n\n" if lang == "fr" else "CANDIDATE PROFILE:\n" + cv_context + "\n\n"

    if lang == "fr":
        system_prompt = cv_section + f"""Tu es un assistant d'entretien expert qui aide les candidats à formuler des réponses pertinentes et professionnelles.

RÈGLES:
1. Génère une réponse structurée et professionnelle
2. Base-toi sur le profil du candidat si disponible
3. Utilise la méthode STAR pour les questions comportementales
4. Sois concis mais complet (2-3 paragraphes max)
5. Adapte le ton au contexte d'un entretien professionnel
6. Réponds en français

Type de question: {q_type}"""
    else:
        system_prompt = cv_section + f"""You are an expert interview assistant helping candidates formulate relevant and professional answers.

RULES:
1. Generate a structured and professional response
2. Base your answer on the candidate's profile if available
3. Use the STAR method for behavioral questions
4. Be concise but complete (2-3 paragraphs max)
5. Adapt the tone to a professional interview context
6. Respond in English

Question type: {q_type}"""

    user_content = f"Historique:\n{history}\n\nQuestion posée:\n\"{question}\""

    try:
        resp = await call_openai_chat(api_key, [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ], model=model)
        return resp["choices"][0]["message"]["content"]
    except Exception as e:
        return "Désolé, une erreur s'est produite lors de la génération de la réponse." if lang == "fr" else "Sorry, an error occurred."

# ============ API ENDPOINTS ============

@app.get("/api/health")
async def health():
    return {"status": "ok"}

# --- Settings ---

@app.get("/api/settings")
async def get_settings():
    settings = await settings_col.find_one({"user_id": "default"}, {"_id": 0})
    if not settings:
        return {"openai_api_key": None, "preferred_model": "gpt-4o-mini", "has_key": False}
    masked = None
    if settings.get("openai_api_key"):
        key = settings["openai_api_key"]
        masked = "••••" + key[-4:] if len(key) > 4 else "••••"
    return {
        "openai_api_key": masked,
        "preferred_model": settings.get("preferred_model", "gpt-4o-mini"),
        "has_key": bool(settings.get("openai_api_key"))
    }

@app.post("/api/settings")
async def save_settings(data: SettingsInput):
    update = {"user_id": "default", "updated_at": now_utc()}
    if data.openai_api_key is not None:
        update["openai_api_key"] = data.openai_api_key if data.openai_api_key else None
    if data.preferred_model:
        update["preferred_model"] = data.preferred_model
    await settings_col.update_one(
        {"user_id": "default"},
        {"$set": update},
        upsert=True
    )
    return {"success": True}

# --- CV ---

@app.get("/api/cv/active")
async def get_active_cv():
    cv = await cv_col.find_one({"is_active": True}, sort=[("created_at", -1)])
    if not cv:
        return None
    return serialize_doc(cv)

@app.post("/api/cv/upload")
async def upload_cv(file: UploadFile = File(...)):
    api_key = await get_user_api_key()
    if not api_key:
        raise HTTPException(400, "Clé API OpenAI non configurée")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 5MB)")

    mime = file.content_type or "application/pdf"
    raw_text = await parse_cv_text(content, mime)
    parsed_data = await parse_cv_with_llm(api_key, raw_text)

    # Deactivate previous CVs
    await cv_col.update_many({"is_active": True}, {"$set": {"is_active": False}})

    doc = {
        "file_name": file.filename,
        "mime_type": mime,
        "file_data": base64.b64encode(content).decode("utf-8"),
        "parsed_data": parsed_data,
        "raw_text": raw_text,
        "is_active": True,
        "created_at": now_utc()
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

# --- Sessions ---

@app.get("/api/sessions")
async def list_sessions():
    sessions = await sessions_col.find({}).sort("created_at", -1).to_list(length=100)
    return serialize_docs(sessions)

@app.get("/api/sessions/stats")
async def get_session_stats():
    sessions = await sessions_col.find({}).to_list(length=100)
    total_questions = sum(s.get("total_questions", 0) for s in sessions)
    total_duration = sum(s.get("duration_seconds", 0) for s in sessions)
    latencies = [s.get("avg_latency_ms", 0) for s in sessions if s.get("avg_latency_ms")]
    avg_latency = round(sum(latencies) / len(latencies)) if latencies else 0
    return {
        "total_questions": total_questions,
        "avg_latency": avg_latency,
        "total_duration": total_duration,
        "total_sessions": len(sessions)
    }

@app.post("/api/sessions")
async def create_session(data: SessionCreate):
    count = await sessions_col.count_documents({})
    if count >= MAX_SESSIONS:
        raise HTTPException(403, f"Limite de {MAX_SESSIONS} sessions atteinte")

    doc = {
        "title": data.title,
        "status": "active",
        "total_questions": 0,
        "total_responses": 0,
        "avg_latency_ms": 0,
        "duration_seconds": 0,
        "detected_language": "fr",
        "created_at": now_utc(),
        "updated_at": now_utc()
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
    if data.detected_language:
        update["detected_language"] = data.detected_language
    await sessions_col.update_one({"_id": ObjectId(session_id)}, {"$set": update})
    return {"success": True}

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    await messages_col.delete_many({"session_id": session_id})
    await sessions_col.delete_one({"_id": ObjectId(session_id)})
    return {"success": True}

@app.get("/api/sessions/{session_id}/messages")
async def get_session_messages(session_id: str):
    msgs = await messages_col.find(
        {"session_id": session_id}
    ).sort("created_at", 1).to_list(length=1000)
    return serialize_docs(msgs)

# --- Interview Processing ---

@app.post("/api/interview/process-audio")
async def process_audio(data: ProcessAudioInput):
    import time
    pipeline_start = time.time()

    api_key = await get_user_api_key()
    if not api_key:
        raise HTTPException(400, "Clé API OpenAI non configurée")

    # Get settings for model preference
    settings = await settings_col.find_one({"user_id": "default"}, {"_id": 0})
    model = settings.get("preferred_model", "gpt-4o-mini") if settings else "gpt-4o-mini"

    # Verify session exists
    session = await sessions_col.find_one({"_id": ObjectId(data.session_id)})
    if not session:
        raise HTTPException(404, "Session non trouvée")

    # Decode audio
    audio_bytes = base64.b64decode(data.audio_data)

    # Transcribe
    transcription_start = time.time()
    result = await transcribe_audio(api_key, audio_bytes, data.mime_type, data.language)
    transcription_ms = int((time.time() - transcription_start) * 1000)

    if "error" in result:
        raise HTTPException(500, result["error"])

    transcript = result.get("text", "")
    detected_lang = result.get("language", "fr")

    # Skip if too short
    if not transcript or len(transcript.strip()) < MIN_TRANSCRIPT_LENGTH:
        return {
            "transcript": None,
            "is_question": False,
            "question_type": None,
            "ai_response": None,
            "detected_language": detected_lang,
            "transcription_latency_ms": transcription_ms,
            "response_latency_ms": 0
        }

    # Save user message
    await messages_col.insert_one({
        "session_id": data.session_id,
        "role": "user",
        "content": transcript,
        "detected_language": detected_lang,
        "transcription_latency_ms": transcription_ms,
        "created_at": now_utc()
    })

    # Update session language
    await sessions_col.update_one(
        {"_id": ObjectId(data.session_id)},
        {"$set": {"detected_language": detected_lang, "updated_at": now_utc()}}
    )

    # Analyze if question
    analysis = await analyze_conversation(api_key, transcript, detected_lang, data.session_id)

    ai_response = None
    response_ms = 0

    if analysis["is_question"]:
        # Get CV for context
        cv = await cv_col.find_one({"is_active": True})
        cv_data = cv.get("parsed_data") if cv else None

        response_start = time.time()
        ai_response = await generate_response(
            api_key, transcript, analysis["question_type"] or "general",
            detected_lang, data.session_id, cv_data, model
        )
        response_ms = int((time.time() - response_start) * 1000)

        # Save AI message
        await messages_col.insert_one({
            "session_id": data.session_id,
            "role": "assistant",
            "content": ai_response,
            "response_latency_ms": response_ms,
            "detected_language": detected_lang,
            "created_at": now_utc()
        })

        # Update session stats
        await sessions_col.update_one(
            {"_id": ObjectId(data.session_id)},
            {
                "$inc": {"total_questions": 1, "total_responses": 1},
                "$set": {"updated_at": now_utc()}
            }
        )

    return {
        "transcript": transcript,
        "is_question": analysis["is_question"],
        "question_type": analysis.get("question_type"),
        "ai_response": ai_response,
        "detected_language": detected_lang,
        "transcription_latency_ms": transcription_ms,
        "response_latency_ms": response_ms,
        "total_pipeline_ms": int((time.time() - pipeline_start) * 1000)
    }
