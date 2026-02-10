# Interview Assistant AI - PRD

## Problem Statement
Interview AI Assistant rebuilt from broken Vite/tRPC/MySQL app. Real-time audio analysis during interview with suggestions. Transcript + Q/A summary generated at session end.

## Architecture
- **Frontend**: React CRA + Tailwind CSS + React Router + ReactMarkdown
- **Backend**: FastAPI + Motor (async MongoDB) + httpx (OpenAI Whisper + GPT)
- **Database**: MongoDB (user_settings, cv_documents, interview_sessions, conversation_messages)
- **AI**: OpenAI Whisper (audio transcription) + GPT (question detection + response generation + summary)

## Core Flow
### During Session (real-time)
1. Audio recording starts → continuous chunks (8s each) sent to backend
2. Each chunk: Whisper transcribes (silently) → GPT detects questions/intentions
3. If question detected → personalized suggestion appears in Suggestions panel
4. **NO transcript displayed** during session — only suggestions

### At Session End (stop recording)
1. "Arrêter et résumer" → redirects to summary page
2. GPT analyzes all stored messages and generates:
   - Complete conversation transcript (recruteur / suggestion IA)
   - Identified questions with categories
   - Q/A pairs (question → suggested answer)
   - Session insights + general feedback

## What's Been Implemented (Feb 10, 2026)
- **V5 (Current)**: Audio-based real-time analysis with suggestions-only display
- Interview page: mic controls (start/pause/stop), waveform indicator, suggestion cards
- Session summary page: insights header, Q/A pairs, identified questions, full transcript
- CV integration: PDF upload, LLM extraction, deep context in responses
- Settings: API key validation, model selection (gpt-4o-mini/gpt-4o/gpt-4-turbo)
- Testing: 100% frontend, 100% V5 features

## Backlog
### P1
- Session export as PDF
- Keyboard shortcuts (Space = start/stop)

### P2
- Multi-language toggle, job description upload
