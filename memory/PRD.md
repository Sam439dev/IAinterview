# Interview Assistant AI - PRD

## Problem Statement
Interview AI Assistant with real-time audio analysis. Fixed: questions not detected, CV not used, errors silent.

## Architecture
- **Frontend**: React CRA + Tailwind + React Router + ReactMarkdown
- **Backend**: FastAPI + Motor (MongoDB) + httpx (OpenAI Whisper + GPT)
- **AI**: Whisper (audio transcription) + GPT (question detection + response generation + session summary)

## Core Flow
### During Session
1. Audio recording → 8s chunks → Whisper transcribes (silently) → GPT detects questions
2. If question detected → suggestion card appears with response, key points, tone advice
3. **No transcript** shown during session, only suggestions

### At Session End
1. Stop → generates full transcript + identified questions + Q/A pairs

## What's Been Fixed (V6 - Feb 10, 2026)

### Bug: No questions detected
- **Root cause**: Detection prompt too conservative, returning `detected: false` for most speech
- **Fix**: Rewrote prompt to be very aggressive — detect as question anything that expects a response from the candidate

### Bug: CV data not used in responses
- **Root cause**: CV parsed_data was empty (only raw_text) because the user's API key was invalid during initial upload
- **Fix**: 
  1. `build_cv_context()` now falls back to raw_text (first 3000 chars) when structured data is empty
  2. Added `POST /api/cv/reparse` endpoint to re-parse CV with valid key
  3. Settings page shows "CV non analysé" warning + "Re-parser le CV" button

### Bug: Errors swallowed silently
- **Fix**: Added logging throughout pipeline (`[WHISPER]`, `[ANALYSIS]`, `[PROCESS-AUDIO]`), error propagation to frontend, error banners in UI

## Testing: 98% overall (96% backend, 100% frontend)

## Backlog
### P1: Session export PDF, keyboard shortcuts
### P2: Multi-language, job description upload
