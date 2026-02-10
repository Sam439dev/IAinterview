# Interview Assistant AI - PRD

## Problem Statement
Interview AI Assistant rebuilt from broken Vite/tRPC/MySQL app. Text-based input (no audio transcription). User types what the interviewer says, AI detects questions and suggests CV-personalized responses. At end of session, generates full summary with transcript, identified questions, and Q/A pairs.

## Architecture
- **Frontend**: React CRA + Tailwind CSS + React Router + ReactMarkdown
- **Backend**: FastAPI + Motor (async MongoDB) + httpx (OpenAI)
- **Database**: MongoDB (user_settings, cv_documents, interview_sessions, conversation_messages)
- **AI**: OpenAI GPT (question detection + response generation + session summary) — user's own API key

## Core Flow
1. User types what the interviewer says in left panel
2. Backend GPT analyzes → detects questions/intentions → generates personalized response
3. Suggestion appears in right panel with category, key points, tone advice, copy button
4. At session end: "Terminer et résumer" generates comprehensive summary

## What's Been Implemented (Feb 10, 2026)

### V4 (Current — with session summary)
- **Interview Page**: Split-view text input, "Terminer et résumer" button
- **Session Summary Page** (`/session/{id}/summary`):
  - Insights header (exchanges, questions detected, Q/A pairs, dominant category)
  - General feedback from AI
  - Q/A Pairs section with collapsible cards (question + suggested answer + category badge)
  - Identified Questions list with categories and context
  - Full Transcript (chronological, speaker-labeled: Recruteur / Suggestion IA)
  - One-click copy on all elements
- **AI Summary Pipeline**: Single GPT call produces structured JSON (transcript, identified_questions, qa_pairs, session_insights)
- **Navigation**: Completed sessions → summary page, active sessions → interview page
- **Testing**: 100% frontend, 100% V4 features, all pages and endpoints verified

## Backlog
### P1
- Session export as PDF
- Keyboard shortcuts

### P2
- Multi-language toggle
- Job description context upload
