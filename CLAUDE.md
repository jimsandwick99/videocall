# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a WebRTC-based video call application with interview recording and transcription capabilities using Twilio for video conferencing and OpenAI Whisper for transcription.

## Key Commands

### Development
- `npm start` or `npm run dev` - Start the Express server on port 5002 (default)
- `node server.js` - Direct server start

### Testing
- `node tests/test-complete-system.js` - Run complete system test
- `node tests/test-transcription-step1.js` - Test transcription step 1
- `node tests/test-transcription-step2.js` - Test transcription step 2
- `node tests/test-transcript-display.js` - Test transcript display
- `node tests/test-system.js` - Run basic system test

### Utilities
- `node simulate-recording.js` - Simulate a recording session
- `node scripts/generate-test-audio.js` - Generate test audio files

## Architecture

### Core Components

1. **Server (server.js)**
   - Express server with Socket.io for real-time communication
   - Handles room creation and WebRTC signaling
   - Integrates Twilio endpoints via `twilio-endpoints.js`
   - Manages file uploads and recordings storage

2. **Twilio Integration (twilio-endpoints.js)**
   - `/api/twilio/start` - Initialize Twilio video room with recording
   - `/api/twilio/stop` - Stop recording and process recordings
   - `/api/twilio/webhook` - Handle Twilio status callbacks
   - Manages access tokens and room lifecycle
   - Downloads and processes recordings post-interview

3. **Transcription Service (transcribe-twilio.js)**
   - Processes Twilio recordings using OpenAI Whisper
   - Converts audio formats (opus/mka to mp3) using ffmpeg
   - Generates timestamped transcript JSON files
   - Handles multiple participant recordings

4. **Frontend Pages**
   - `public/index.html` - Landing page for creating/joining rooms
   - `public/room.html` - Main video call interface with Twilio SDK integration
   - `public/transcript-viewer.html` - View interview transcripts
   - `public/share-utils.js` - Utilities for sharing recordings

### Data Flow

1. User creates room → Server generates UUID → Twilio room created
2. Participants join with tokens → Video/audio streams established
3. Recording automatically starts when participants connect
4. On interview end → Recordings downloaded from Twilio
5. Audio files transcribed → JSON transcript generated
6. Transcript viewable at `/transcript/{roomId}`

## Environment Variables

Required in `.env`:
- `OPENAI_API_KEY` - For Whisper transcription
- `TWILIO_ACCOUNT_SID` - Twilio account identifier
- `TWILIO_AUTH_TOKEN` - Twilio authentication token
- `TWILIO_API_KEY_SID` - For generating access tokens
- `TWILIO_API_KEY_SECRET` - Secret for API key
- `PORT` - Server port (default: 3001)
- `BASE_URL` - Optional, for Twilio webhooks

## Dependencies

### Core
- Express 5.x with Socket.io for real-time communication
- Twilio SDK for video conferencing
- OpenAI SDK for transcription
- ffmpeg (system dependency) for audio conversion

### Storage
- Recordings stored in `recordings/{roomId}/twilio/`
- Transcripts saved as `transcript.json` in room directory
- Temporary files handled in `recordings/temp/`

## Important Notes

1. **Twilio Recording**: Automatic recording starts when participants join. Recordings are downloaded after the room ends (via webhook or manual stop).

2. **Audio Conversion**: Twilio provides opus/mka format. System requires ffmpeg to convert to mp3 for OpenAI Whisper.

3. **File Structure**: Each room creates a directory with timestamp prefix for organization and uniqueness.

4. **Error Handling**: Extensive logging throughout Twilio operations. Check console for `[TWILIO]` prefixed messages.

5. **Security**: Never commit `.env` file. All Twilio credentials must be kept secure.

6. **Testing**: Use test HTML files in public/ directory for isolated feature testing before integration.