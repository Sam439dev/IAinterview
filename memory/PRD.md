# Interview Assistant AI - PRD

## Problem Statement
Interview AI Assistant rebuilt from broken Vite/tRPC/MySQL app. Scope refined: no audio transcription — text-based input where user types what the interviewer says, AI detects questions/intentions and suggests CV-personalized responses.

## Architecture
- **Frontend**: React CRA + Tailwind CSS + React Router + ReactMarkdown
- **Backend**: FastAPI + Motor (async MongoDB) + httpx (OpenAI)
- **Database**: MongoDB (user_settings, cv_documents, interview_sessions, conversation_messages)
- **AI**: OpenAI GPT (question detection + response generation) — user's own API key

## Core Flow
1. User types what the interviewer/recruiter says in the left panel
2. Backend sends text to GPT for analysis (question detection + categorization)
3. If a question/intention is detected, GPT generates a personalized response using CV data
4. Suggestion appears in the right panel with: category, confidence, key points, tone advice, copy button

## What's Been Implemented (Feb 10, 2026)

### V3 (Current — text-based, no audio)
- **Interview Page**: Split-view with text input (left: "Ce que dit le recruteur") and suggestions (right: "Suggestions de réponses")
- **AI Pipeline**: POST /api/interview/process-text — combined analysis + response generation in one GPT call
- **6 Categories**: Technique, Comportementale, Expérience, Motivation, Mise en situation, Présentation
- **Suggestion Cards**: Category badges, confidence %, key points, tone advice, one-click copy, CV usage indicator
- **CV Integration**: PDF upload with LLM-powered structured extraction, deep context injection in responses
- **Settings**: API key with real-time validation, model selection (gpt-4o-mini/gpt-4o/gpt-4-turbo)
- **Session Management**: CRUD, max 10, stats tracking
- **Mobile**: Tab toggle (Conversation / Suggestions)
- **Testing**: 100% frontend, 95% backend (1 minor: OpenAI returns 401 for invalid key — expected behavior)

## Backlog
### P1
- Simulation mode (AI plays recruiter)
- Session export (PDF)
- Keyboard shortcuts

### P2
- Multi-language toggle
- Job description context
- Session comparison
