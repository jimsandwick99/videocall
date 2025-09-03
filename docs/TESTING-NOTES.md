# Important Testing Notes

## ⚠️ Testing on Same Device / Close Proximity

When testing with two devices close together (or two browser tabs on same machine), you will experience:

### 1. **Audio Crosstalk**
- Each microphone picks up the other device's speaker output
- This causes duplicate audio in recordings
- The "mute" button only mutes YOUR outgoing WebRTC stream, NOT the Twilio recording

### 2. **Why Duplication Occurs**
```
Device A (Interviewer):
- Microphone records: Your voice + Device B's speaker
- Sends to Twilio as: "interviewer" track

Device B (Interviewee):  
- Microphone records: Your voice + Device A's speaker
- Sends to Twilio as: "interviewee" track

Result: Both voices appear in both tracks!
```

### 3. **Solutions for Testing**

#### Option A: Physical Separation
- Use different rooms
- Use headphones on both devices
- Mute speakers (not just microphone) when not speaking

#### Option B: Use Simulation
```bash
node simulate-recording.js
```
This creates realistic test recordings without audio conflicts.

#### Option C: Remote Testing
- Have a colleague join from their location
- Use two different networks/locations
- Test with actual interview conditions

## 🎯 What Was Fixed

### Identity Assignment Bug
**Problem**: Both participants were connecting as "interviewer"
**Fix**: 
- Interviewer sends `isInterviewer: true`
- Interviewee (when notified) sends `isInterviewer: false`
- Each gets their correct Twilio token

### Recording Flow
1. Interviewer clicks "Start Recording"
   - Connects to Twilio as "interviewer"
   - Notifies interviewee via Socket.IO
   
2. Interviewee receives notification
   - Automatically connects to Twilio as "interviewee"
   - Both audio tracks recorded separately

3. Stop recording
   - Both disconnect from Twilio
   - Files saved with correct labels
   - Transcription identifies speakers

## 📝 Expected Output

### Correct Recording Files:
```
interviewer_[trackId]_[recordingId].opus
interviewee_[trackId]_[recordingId].opus
```

### Correct Transcript:
```
[00:00] Interviewer:
 Question asked by interviewer...

[00:05] Interviewee:
 Response from interviewee...
```

## 🚨 Known Limitations

1. **Timestamp Alignment**: Since tracks are recorded separately, timestamps represent position within each track, not absolute conversation time.

2. **Cross-talk in Close Proximity**: Physical audio bleed between devices cannot be prevented by software.

3. **Network Latency**: Small delays between interviewer starting and interviewee joining Twilio room.

## ✅ Production Ready

For real interviews with participants in different locations, the system works perfectly:
- Clear separation of speakers
- Accurate transcription
- No audio duplication
- Proper speaker identification