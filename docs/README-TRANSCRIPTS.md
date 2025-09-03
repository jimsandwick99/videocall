# Video Call Recording & Transcription System

## ✅ System Status
The system is now fully configured for recording interviews and generating transcripts automatically.

## 🎯 What This System Does

1. **Records video interviews** using Twilio's cloud recording service
2. **Automatically transcribes** recordings using OpenAI Whisper
3. **Generates formatted transcripts** with timestamps and speaker identification
4. **Provides a web interface** to view and download transcripts

## 🚀 How to Use

### Starting the Server
```bash
npm start
```
Then open http://localhost:5002 in your browser

### Recording an Interview

1. **Create a Room**
   - Click "Create Video Call Room"
   - You'll get two links:
     - Interviewer link (with recording controls)
     - Candidate link (for the interviewee)

2. **Join as Interviewer**
   - Use the interviewer link or click "Join as Interviewer"
   - You'll see recording controls at the bottom

3. **Start Recording**
   - Once both parties are connected
   - Click the "Start Recording" button (⏺️)
   - A red indicator will show recording is active

4. **Conduct Interview**
   - Both audio tracks are recorded separately
   - Video is displayed but only audio is recorded

5. **Stop Recording**
   - Click "Stop Recording" button (⏹️)
   - System will:
     - Download recordings from Twilio
     - Automatically transcribe using OpenAI Whisper
     - Generate formatted transcript

6. **View Transcript**
   - Go back to the main page
   - Click "Refresh" in the Recordings section
   - Click "📝 View Transcript" to see the formatted text
   - Click "📊 Download JSON" for structured data

## 📁 File Structure

```
recordings/
└── [room-id]/
    ├── twilio/
    │   ├── interviewer_audio_[sid].mka
    │   └── interviewee_audio_[sid].mka
    ├── twilio_transcript.txt      # Human-readable transcript
    └── twilio_transcript.json     # Structured transcript data
```

## 🔧 Technical Details

### Recording Format
- **Container**: `.mka` (Matroska Audio)
- **Codec**: Opus (efficient compression)
- **Quality**: High quality, optimized for speech

### Transcription
- **Engine**: OpenAI Whisper API
- **Language**: English (auto-detected)
- **Output**: Timestamped segments with speaker identification

### Architecture
- **Recording**: Twilio Video API (cloud-based)
- **Transcription**: OpenAI Whisper (automatic after recording)
- **Storage**: Local filesystem
- **API**: RESTful endpoints for recordings and transcripts

## 🐛 Troubleshooting

### No Recordings Appearing
- Check browser console for errors
- Verify both users have granted microphone permissions
- Ensure you're using the interviewer link to see recording controls

### Transcription Not Working
- Check server logs for transcription errors
- Verify OpenAI API key is valid
- Ensure ffmpeg is installed (`brew install ffmpeg`)

### Recording Button Not Visible
- Only visible for the interviewer (room creator)
- Make sure you used the "interviewer" link

## 📊 API Endpoints

- `GET /api/recordings` - List all recordings with transcripts
- `GET /api/transcript/:roomId` - Get transcript (text or JSON)
- `GET /api/recordings/:roomId/:filename` - Download audio file
- `POST /api/twilio/start` - Start recording (called by UI)
- `POST /api/twilio/stop` - Stop and transcribe (called by UI)

## 🎯 Key Features

✅ **Automatic Transcription** - No manual steps needed
✅ **Speaker Identification** - Distinguishes interviewer from interviewee
✅ **Timestamped Segments** - Know when things were said
✅ **Cloud Recording** - Reliable Twilio infrastructure
✅ **Simple UI** - Easy to use interface
✅ **Downloadable Files** - Get audio and transcripts

## 💡 Tips

1. **Test with yourself** - Open two browser windows, one incognito
2. **Check transcripts** - Review for accuracy, especially technical terms
3. **Save important interviews** - Download both audio and transcript files
4. **Monitor server logs** - Detailed debugging information available

## 🚨 Important Notes

- Recordings consume Twilio credits (check your account)
- Transcription uses OpenAI API credits
- Files are stored locally (not in cloud)
- Only interviewer can control recording
- Both participants need good internet connection

## 📝 Testing the System

Run the test script to verify everything is working:
```bash
node test-system.js
```

This will check:
- Server connection
- Twilio configuration
- OpenAI API key
- ffmpeg installation
- Existing recordings

---

**System is ready for use!** Start recording and transcribing interviews immediately.