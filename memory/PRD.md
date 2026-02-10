# Interview Assistant AI - PRD

## Problem Statement
User had an Interview AI Assistant app built with Vite/tRPC/MySQL/Blink SDK (Manus platform) with console errors:
- `TypeError: Failed to construct 'URL': Invalid URL`
- `umami: Failed to load resource: 400`
- `woff2 font 404`
App was completely rebuilt for Emergent platform as a professional, sellable SaaS product.

## Architecture
- **Frontend**: React CRA + Tailwind CSS + React Router + Framer Motion + ReactMarkdown
- **Backend**: FastAPI + Motor (async MongoDB driver) + httpx (OpenAI API calls)
- **Database**: MongoDB (collections: user_settings, cv_documents, interview_sessions, conversation_messages)
- **AI Pipeline**: OpenAI Whisper (audio transcription) + GPT (question detection + response generation) - user's own API key
- **Design**: Dark minimal theme with Sora/DM Sans/JetBrains Mono fonts, accent #00e5ff

## User Personas
- French-speaking job seekers preparing for technical interviews
- Professionals needing real-time AI coaching during interviews

## Core Requirements
1. Split-view interview interface (transcript left / AI suggestions right)
2. Audio recording → Whisper transcription → GPT question detection → CV-personalized response
3. CV upload (PDF/TXT) with LLM-powered structured extraction
4. Session management (max 10 sessions) with analytics
5. Settings: API key validation, model selection
6. French UI, mobile responsive

## What's Been Implemented (Feb 10, 2026)

### V1 (Initial rebuild)
- Complete migration from Vite/tRPC/MySQL to React CRA/FastAPI/MongoDB
- Eliminated all console errors
- Basic pages: Home, Dashboard, Interview, Settings, Sessions

### V2 (Professional rebuild - Current)
- **Redesigned UX**: Minimal dark theme with glass-morphism, noise texture, subtle animations
- **Interview Page**: Professional split-view with live transcript (left) and AI suggestions (right), mobile tabs, waveform indicator, status badges
- **AI Pipeline**: Combined question detection + response generation in single API call for speed
- **Suggestion Cards**: Category badges (technique/comportementale/expérience/motivation/mise en situation), confidence %, key points, tone advice, one-click copy
- **CV Integration**: Deep structured extraction (skills, technologies, experiences, education, strengths, certifications), visible in settings with rich display
- **API Key Validation**: Real-time key testing against OpenAI API
- **6 category detection**: Technical, Behavioral, Experience, Motivation, Situational, Presentation
- **Mobile Responsive**: Tab toggle on interview page, all pages work on mobile
- **Testing**: 100% pass rate (V1: 24/24, V2: 25/25 tests)

## Prioritized Backlog
### P0
- None remaining

### P1
- Simulation mode (AI-generated practice questions)
- Session export (PDF report)
- Keyboard shortcuts (Space to start/stop recording)
- VAD (Voice Activity Detection) for smarter chunking

### P2
- Multi-language toggle (FR/EN)
- Job description upload for targeted prep
- Session comparison analytics
- Sound notifications on suggestion arrival

## Next Tasks
1. Test with real OpenAI API key for full pipeline validation
2. Simulation mode implementation
3. PWA support for discreet mobile use
