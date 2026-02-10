# Interview Assistant AI - PRD

## Problem Statement
User had an Interview AI Assistant app built with Vite/tRPC/MySQL/Blink SDK that had multiple console errors:
- `TypeError: Failed to construct 'URL': Invalid URL` (from undefined VITE_OAUTH_PORTAL_URL)
- `umami: Failed to load resource: 400` (analytics dependency)
- `woff2 font 404` (missing font files)
- App was built for "Manus" platform with proprietary dependencies that don't work outside that environment

## Architecture
- **Frontend**: React CRA + Tailwind CSS + React Router
- **Backend**: FastAPI + Motor (async MongoDB driver)
- **Database**: MongoDB (collections: user_settings, cv_documents, interview_sessions, conversation_messages)
- **AI**: OpenAI GPT (chat completions) + Whisper (audio transcription) - user provides own API key
- **Theme**: Dark cyberpunk with Outfit/Manrope/JetBrains Mono fonts

## User Personas
- French-speaking job seekers preparing for technical interviews
- Professionals needing real-time AI coaching during interview preparation

## Core Requirements
- Audio recording → Whisper transcription → GPT question detection → personalized response generation
- CV upload (PDF/TXT) with structured extraction via LLM
- Session management (max 5 sessions)
- Settings: API key, model preference
- French language UI

## What's Been Implemented (Feb 10, 2026)
- Complete rebuild from Vite/tRPC/MySQL stack to React CRA/FastAPI/MongoDB
- All console errors eliminated (no umami, no invalid URL, no font 404)
- **Pages**: Home (landing), Dashboard (stats + sessions), Interview (split view with audio controls), Settings (API key + CV upload), Sessions (history + analytics)
- **Backend API**: 11 endpoints (health, settings CRUD, CV upload/delete, sessions CRUD, messages, audio processing)
- **Features**: Audio recording with MediaRecorder API, base64 transmission, Whisper transcription, GPT analysis/response generation, CV parsing, session stats
- Professional cyberpunk dark theme, French UI, responsive design
- **Testing**: 100% pass rate (24/24 tests - both backend and frontend)

## Prioritized Backlog
### P0 (Critical)
- None remaining

### P1 (Important)
- Simulation mode (practice with AI-generated questions)
- Session export (PDF/text)
- Keyboard shortcuts for recording control
- More robust audio chunking (VAD-based)

### P2 (Nice to have)
- Multi-language support toggle
- Session comparison analytics
- Job description upload for targeted preparation
- Voice speed/difficulty settings

## Next Tasks
1. User testing with real OpenAI API key
2. Simulation mode implementation
3. Advanced analytics dashboard
4. PWA support for mobile use during interviews
