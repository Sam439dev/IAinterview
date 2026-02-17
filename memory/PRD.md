# Interview Copilot AI - Product Requirements Document

## Overview
Real-time AI Interview Assistant - Production-ready replica of LockedIn AI's Interview Copilot.

## Core Features

### 1. Pre-Interview Setup
- **CV Upload & Parsing**: PDF/TXT upload with LLM-powered extraction (experiences, skills, technologies)
- **Profile Building**: Job description analysis, company research via DuckDuckGo
- **Vector Database**: FAISS index for semantic search on profile data

### 2. Real-Time Interview Assistance
- **Live Transcription**: WebSocket streaming with faster-whisper STT
- **Speaker Diarization**: pyannote.audio for interviewer/candidate detection
- **AI Suggestions**: Context-aware answers streamed token-by-token
- **Meeting View**: Side-by-side layout with PiP (Picture-in-Picture) screen capture

### 3. Settings & Configuration
- **Multi-LLM Support**: OpenAI, Anthropic, DeepSeek, Gemini (user-provided API keys)
- **API Key Management**: Secure local storage, confirmation modal for deletion
- **Audio Device Selection**: Microphone picker for optimal capture

## Technical Architecture

### Frontend (React + Vite)
- `/app/frontend/src/pages/Interview.jsx` - Main interview UI with streaming
- `/app/frontend/src/pages/Settings.jsx` - API keys and profile management
- `/app/frontend/src/store/interviewStore.js` - Zustand state management

### Backend (FastAPI)
- `/app/backend/server.py` - All API endpoints and WebSocket handlers
- `/app/backend/vector_store.py` - FAISS vector database operations

### Key Endpoints
- `GET /api/health` - Health check
- `POST /api/cv/upload` - CV upload with parsing
- `POST /api/cv/reparse` - Re-parse existing CV
- `POST /api/ingestion/build-profile` - Build interview profile
- `WS /api/ws/stream` - Real-time audio streaming

## What's Been Implemented (Feb 2026)

### Completed Features
1. ✅ **Settings Page**
   - Multi-provider API key management (OpenAI, Anthropic, DeepSeek, Gemini)
   - Visible "Effacer" button with confirmation modal
   - Model selection with suggestions
   - Whisper STT key configuration

2. ✅ **CV Section**
   - PDF upload and parsing
   - Skills displayed as colored tags (hard skills, soft skills, technologies)
   - **FIXED: Dashboard shows correct skill count** (was "0 compétences")
   - Experiences list with company/role/duration
   - Re-parse functionality

3. ✅ **Profile Builder (P0 Fixed)**
   - Form data persistence in localStorage
   - Loading states with step indicators
   - Profile status display (doc count badge)
   - Error handling with visual feedback
   - Clear profile option

4. ✅ **Interview Page**
   - Side-by-side layout (Meeting View | Assistant IA)
   - PiP (Picture-in-Picture) mode using Screen Capture API
   - Real-time transcript streaming with TypeWriter effect
   - AI suggestions with streaming animation
   - **NEW: Pre-interview checklist** (API key, CV, Profile status)

5. ✅ **Real-Time Streaming**
   - WebSocket connection for live audio
   - faster-whisper transcription
   - Token-by-token suggestion streaming
   - Auto-scroll to latest content
   - Speaker diarization (interviewer/candidate)

6. ✅ **Coaching Layer**
   - Filler word detection (French: euh, heu, ben, donc, voilà; English: um, uh, like)
   - Real-time filler counter in UI
   - Color-coded warnings (green → amber → red)
   - Coaching tips when thresholds reached

7. ✅ **Post-Interview Analysis Page (P2 NEW)**
   - Performance metrics grid (Exchanges, Questions, Suggestions, Duration, WPM, Fillers)
   - Filler word breakdown with color-coded badges
   - AI-generated feedback section
   - Q&A pairs with collapsible answers
   - Full transcript viewer with search/filter
   - Export options (JSON, PDF)

### UI/UX Improvements
- French language UI
- Dark theme with cyan/purple accent colors
- Responsive design (mobile/desktop)
- Smooth animations (slideIn, fadeIn, pulse)
- Professional chip/badge styling

## Pending/Future Tasks

### P0 - Critical (COMPLETED ✅)
- [x] Fix Profile Ingestion - COMPLETED ✅
  - Form data persists in localStorage
  - Loading states with step indicators
  - Profile status display (14 docs badge)
  - Error handling with visual feedback
  - Clear profile option

### P1 - High Priority
- [x] End-to-end streaming pipeline - COMPLETED ✅
- [x] Speaker diarization UI integration - COMPLETED ✅
- [ ] Live streaming test with real API keys (requires user API key)

### P2 - Medium Priority
- [ ] Post-interview analysis page
- [ ] Session summary generation
- [ ] Export transcript functionality

### P3 - Future Enhancements
- [ ] Local STT with faster-whisper (no API required)
- [ ] Intent detection with DistilBERT
- [ ] Performance metrics dashboard
- [ ] Multi-language support

## Success Metrics
- Button visibility: 100% of users can find "Effacer"
- CV skills display: 100% match parsed data
- Transcript latency: <300ms word appearance
- Suggestion latency: first token <1s
- Meeting View: PiP mode functional

## Tech Stack
- **Frontend**: React 18, Vite, Tailwind CSS, Zustand
- **Backend**: FastAPI, WebSockets, Motor (MongoDB)
- **AI/ML**: faster-whisper, pyannote.audio, sentence-transformers
- **Vector DB**: FAISS (persisted to disk)
- **LLM Providers**: OpenAI, Anthropic, DeepSeek, Gemini
