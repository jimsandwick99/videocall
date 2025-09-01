# Audio Recording & Transcription Implementation Plan

## Architecture Overview

### Phase 1: Client-Side Recording with Auto-Upload
1. Record audio on both clients during the call
2. Automatically upload to server when recording stops
3. Server merges audio tracks
4. Send to OpenAI Whisper API for transcription
5. Apply speaker diarization

### Phase 2: Server-Side Recording (Future)
- Implement WebRTC SFU (MediaSoup/Janus)
- Record directly on server
- More reliable but requires infrastructure changes

## Implementation Steps

### 1. Enhanced Client-Side Recording

```javascript
// Record both local and remote audio with higher quality
const recordingOptions = {
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 128000
};

// Separate recordings for each speaker
let localRecorder;   // Records only local audio
let remoteRecorder;  // Records only remote audio
let combinedRecorder; // Records mixed audio as backup
```

### 2. Auto-Upload System

```javascript
// Automatically upload when call ends or every 5 minutes
function setupAutoUpload() {
  // Chunk recording every 5 minutes for long calls
  setInterval(() => {
    if (isRecording) {
      stopAndUploadChunk();
      startNewChunk();
    }
  }, 5 * 60 * 1000);
}

// Upload with metadata
async function uploadRecording(blob, metadata) {
  const formData = new FormData();
  formData.append('audio', blob);
  formData.append('roomId', roomId);
  formData.append('userId', userId);
  formData.append('timestamp', Date.now());
  formData.append('duration', duration);
  formData.append('speakerRole', 'interviewer|interviewee');
  
  await fetch('/api/upload-recording', {
    method: 'POST',
    body: formData
  });
}
```

### 3. Server-Side Processing

```javascript
// server.js additions
const multer = require('multer');
const AWS = require('aws-sdk');
const OpenAI = require('openai');

// Store recordings in S3/R2
app.post('/api/upload-recording', upload.single('audio'), async (req, res) => {
  const { roomId, userId, timestamp, speakerRole } = req.body;
  
  // Upload to S3/R2
  const s3Key = `recordings/${roomId}/${userId}-${timestamp}.webm`;
  await uploadToS3(req.file.buffer, s3Key);
  
  // Store metadata in database
  await storeRecordingMetadata({
    roomId,
    userId,
    s3Key,
    speakerRole,
    timestamp,
    duration: req.body.duration
  });
  
  // Trigger transcription after call ends
  if (req.body.callEnded) {
    await processRecording(roomId);
  }
});
```

### 4. Whisper Transcription with Speaker Labels

```javascript
async function processRecording(roomId) {
  // Get all recording chunks for this room
  const recordings = await getRecordingsByRoom(roomId);
  
  // For each speaker's recording
  for (const recording of recordings) {
    const audioUrl = await getS3SignedUrl(recording.s3Key);
    
    // Send to Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: await fetch(audioUrl).then(r => r.blob()),
      model: "whisper-1",
      response_format: "verbose_json", // Gets word-level timestamps
      prompt: "This is an interview recording." // Helps with context
    });
    
    // Store with speaker label
    await storeTranscription({
      roomId,
      speakerId: recording.userId,
      speakerRole: recording.speakerRole,
      segments: transcription.segments,
      fullText: transcription.text
    });
  }
  
  // Merge transcriptions with timestamps
  await mergeTranscriptions(roomId);
}
```

### 5. Speaker Diarization Options

#### Option A: Use Recording Metadata
- Simple: We know who's speaking based on which client recorded
- Label as "Interviewer" and "Interviewee"

#### Option B: Advanced Diarization
- Use pyannote.audio (Python service)
- Or AWS Transcribe with speaker identification
- More accurate for overlapping speech

### 6. Database Schema

```sql
-- Recording metadata
CREATE TABLE recordings (
  id UUID PRIMARY KEY,
  room_id VARCHAR(255),
  user_id VARCHAR(255),
  speaker_role ENUM('interviewer', 'interviewee'),
  s3_key VARCHAR(255),
  timestamp BIGINT,
  duration INTEGER,
  created_at TIMESTAMP
);

-- Transcriptions
CREATE TABLE transcriptions (
  id UUID PRIMARY KEY,
  room_id VARCHAR(255),
  speaker_id VARCHAR(255),
  speaker_role VARCHAR(50),
  segment_start FLOAT,
  segment_end FLOAT,
  text TEXT,
  confidence FLOAT,
  created_at TIMESTAMP
);
```

## Required Services & Costs

### 1. Storage
- **Cloudflare R2**: $0.015/GB/month (no egress fees)
- **AWS S3**: $0.023/GB/month + egress fees

### 2. Transcription
- **OpenAI Whisper API**: $0.006/minute
- **AWS Transcribe**: $0.024/minute (includes speaker identification)
- **AssemblyAI**: $0.01/minute (includes speaker diarization)

### 3. Processing
- **Render Background Jobs**: For async processing
- Or AWS Lambda for serverless processing

## Environment Variables Needed

```env
# Storage
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET_NAME=

# Or Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=

# Transcription
OPENAI_API_KEY=
# Or
AWS_TRANSCRIBE_REGION=
# Or  
ASSEMBLYAI_API_KEY=

# Database
DATABASE_URL=
```

## Implementation Priority

1. **Phase 1**: Basic recording with manual upload button ✅ (Already exists)
2. **Phase 2**: Auto-upload to server when call ends
3. **Phase 3**: Cloud storage integration (S3/R2)
4. **Phase 4**: Whisper API integration
5. **Phase 5**: Speaker labeling using metadata
6. **Phase 6**: Advanced speaker diarization (optional)

## Estimated Timeline

- Phase 2-3: 2-3 hours (auto-upload + storage)
- Phase 4: 2 hours (Whisper integration)
- Phase 5: 1 hour (basic speaker labels)
- Phase 6: 4+ hours (advanced diarization)

Total: ~8-10 hours for complete implementation

## Alternative: Use Existing Services

For faster implementation, consider:
- **Recall.ai**: Records and transcribes video calls automatically
- **Fireflies.ai**: Joins calls and transcribes
- **Otter.ai**: Real-time transcription API
- **Rev.ai**: Async transcription with speakers

These services handle recording, storage, and transcription but cost more (~$0.02-0.05/minute).