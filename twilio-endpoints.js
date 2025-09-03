// Twilio Recording Endpoints
// Add this to your server.js or include as a module

const express = require('express');
const twilio = require('twilio');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios').default || require('axios');
const transcribeTwilioRecording = require('./transcribe-twilio');

function createTwilioEndpoints(app) {
  // Test endpoint to verify Twilio is configured
  app.get('/api/twilio/test', (req, res) => {
    res.json({ 
      success: true, 
      message: 'Twilio endpoints are loaded',
      configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
    });
  });

  // Initialize Twilio
  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  // Store active Twilio rooms
  const twilioRooms = new Map();

  // Start Twilio recording
  app.post('/api/twilio/start', async (req, res) => {
    try {
      const { roomId, isInterviewer } = req.body;
      
      console.log(`[TWILIO START] ========================================`);
      console.log(`[TWILIO START] Creating room for roomId: ${roomId}`);
      console.log(`[TWILIO START] User role: ${isInterviewer ? 'Interviewer' : 'Interviewee'}`);
      console.log(`[TWILIO START] Timestamp: ${new Date().toISOString()}`);
      
      // Check if Twilio is properly configured
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        console.error('[TWILIO START ERROR] Missing Twilio credentials');
        return res.status(500).json({
          success: false,
          error: 'Twilio not configured properly'
        });
      }
      
      if (!process.env.TWILIO_API_KEY_SID || !process.env.TWILIO_API_KEY_SECRET) {
        console.error('[TWILIO START ERROR] Missing Twilio API keys');
        return res.status(500).json({
          success: false,
          error: 'Twilio API keys not configured'
        });
      }
      
      console.log(`[TWILIO START] Account SID: ${process.env.TWILIO_ACCOUNT_SID?.substring(0, 10)}...`);
      console.log(`[TWILIO START] API Key SID: ${process.env.TWILIO_API_KEY_SID?.substring(0, 10)}...`);
      
      // Create Twilio room with recording enabled
      console.log('[TWILIO START] Creating Twilio room with recording enabled...');
      const room = await twilioClient.video.v1.rooms.create({
        uniqueName: `room_${roomId}_${Date.now()}`,
        type: 'group', // or 'group-small' for 2-4 participants
        recordParticipantsOnConnect: true, // This should auto-record
        statusCallback: process.env.BASE_URL ? `${process.env.BASE_URL}/api/twilio/webhook` : undefined,
        statusCallbackMethod: 'POST',
        maxParticipants: 10,
        mediaRegion: 'us1'
        // Note: recordingRules are set separately via Recording Rules API if needed
      });

      // Generate access tokens for participants
      const AccessToken = twilio.jwt.AccessToken;
      const VideoGrant = AccessToken.VideoGrant;

      // Token for interviewer
      const interviewerToken = new AccessToken(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_API_KEY_SID,
        process.env.TWILIO_API_KEY_SECRET,
        { 
          identity: 'interviewer',
          ttl: 14400 // 4 hours
        }
      );

      const interviewerGrant = new VideoGrant({
        room: room.uniqueName
      });
      interviewerToken.addGrant(interviewerGrant);

      // Token for interviewee
      const intervieweeToken = new AccessToken(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_API_KEY_SID,
        process.env.TWILIO_API_KEY_SECRET,
        { 
          identity: 'interviewee',
          ttl: 14400
        }
      );

      const intervieweeGrant = new VideoGrant({
        room: room.uniqueName
      });
      intervieweeToken.addGrant(intervieweeGrant);

      // Store room info
      twilioRooms.set(roomId, {
        twilioRoomSid: room.sid,
        twilioRoomName: room.uniqueName,
        startTime: Date.now()
      });

      console.log(`[TWILIO START] Room created successfully:`);
      console.log(`[TWILIO START]   - SID: ${room.sid}`);
      console.log(`[TWILIO START]   - Name: ${room.uniqueName}`);
      console.log(`[TWILIO START]   - Recording enabled: ${room.recordParticipantsOnConnect}`);
      console.log(`[TWILIO START] Stored in twilioRooms Map with key: ${roomId}`);
      
      // Return only the appropriate token based on role
      const token = isInterviewer ? interviewerToken.toJwt() : intervieweeToken.toJwt();
      const identity = isInterviewer ? 'interviewer' : 'interviewee';
      
      console.log(`[TWILIO START] Returning token for: ${identity}`);
      
      res.json({
        success: true,
        room: {
          sid: room.sid,
          name: room.uniqueName
        },
        token: token,
        identity: identity
      });

      console.log(`[TWILIO START] Response sent to client`);
      console.log(`[TWILIO START] ========================================`);
      
    } catch (error) {
      console.error('[TWILIO START ERROR] ========================================');
      console.error('[TWILIO START ERROR] Failed to create room:', error.message);
      console.error('[TWILIO START ERROR] Stack:', error.stack);
      console.error('[TWILIO START ERROR] ========================================');
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Stop Twilio recording and download files
  app.post('/api/twilio/stop', async (req, res) => {
    try {
      const { roomId } = req.body;
      
      console.log(`[TWILIO STOP] ========================================`);
      console.log(`[TWILIO STOP] Stopping recording for roomId: ${roomId}`);
      console.log(`[TWILIO STOP] Timestamp: ${new Date().toISOString()}`);
      
      const roomInfo = twilioRooms.get(roomId);
      
      if (!roomInfo) {
        console.error(`[TWILIO STOP ERROR] Room not found in Map for roomId: ${roomId}`);
        console.log(`[TWILIO STOP] Active rooms in Map:`, Array.from(twilioRooms.keys()));
        return res.status(404).json({ 
          success: false, 
          error: 'Room not found' 
        });
      }

      console.log(`[TWILIO STOP] Found room info:`);
      console.log(`[TWILIO STOP]   - Twilio Room SID: ${roomInfo.twilioRoomSid}`);
      console.log(`[TWILIO STOP]   - Twilio Room Name: ${roomInfo.twilioRoomName}`);
      console.log(`[TWILIO STOP]   - Duration: ${Math.floor((Date.now() - roomInfo.startTime) / 1000)} seconds`);

      // Complete the room (stops recording)
      console.log(`[TWILIO STOP] Completing room...`);
      await twilioClient.video.v1.rooms(roomInfo.twilioRoomSid)
        .update({ status: 'completed' });
      console.log(`[TWILIO STOP] Room completed successfully`);

      // Wait for recordings to be processed (with timeout)
      console.log(`[TWILIO STOP] Waiting for recordings to process...`);
      const waitTime = 5000; // 5 seconds
      const waitPromise = new Promise(resolve => setTimeout(resolve, waitTime));
      await Promise.race([
        waitPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for recordings')), 10000))
      ]).catch(err => {
        console.warn(`[TWILIO STOP WARNING] ${err.message}, continuing anyway...`);
      });

      // Get all recordings
      console.log(`[TWILIO STOP] Fetching recordings...`);
      let recordings = [];
      try {
        recordings = await twilioClient.video.v1.rooms(roomInfo.twilioRoomSid)
          .recordings
          .list();
      } catch (error) {
        console.error(`[TWILIO STOP ERROR] Failed to fetch recordings:`, error.message);
        // Continue anyway - recordings might still be processing
      }

      console.log(`[TWILIO STOP] Found ${recordings.length} recordings`);
      
      // Log recording details for debugging
      if (recordings.length > 0) {
        console.log(`[TWILIO STOP] Recording details:`);
        recordings.forEach((rec, idx) => {
          console.log(`[TWILIO STOP]   Recording ${idx + 1}:`);
          console.log(`[TWILIO STOP]     - Codec: ${rec.codec}`);
          console.log(`[TWILIO STOP]     - Container: ${rec.container}`);
          console.log(`[TWILIO STOP]     - Type: ${rec.type}`);
        });
      }
      
      if (recordings.length === 0) {
        console.log('[TWILIO STOP WARNING] No recordings found - possible reasons:');
        console.log('[TWILIO STOP WARNING]   - Recording may still be processing');
        console.log('[TWILIO STOP WARNING]   - No participants joined the Twilio room');
        console.log('[TWILIO STOP WARNING]   - Recording was not enabled properly');
        return res.json({
          success: true,
          recordings: [],
          message: 'No recordings found - recording may still be processing'
        });
      }

      // Get participant information
      const participants = await twilioClient.video.v1.rooms(roomInfo.twilioRoomSid)
        .participants
        .list();
      
      console.log(`[TWILIO STOP] Found ${participants.length} participants:`);
      participants.forEach((p, idx) => {
        console.log(`[TWILIO STOP]   Participant ${idx + 1}: ${p.identity} (SID: ${p.sid})`);
      });

      // Download recordings
      const recordingDir = path.join(__dirname, 'recordings', roomId, 'twilio');
      console.log(`[TWILIO STOP] Creating directory: ${recordingDir}`);
      await fs.ensureDir(recordingDir);

      const downloadedFiles = [];
      
      for (const recording of recordings) {
        console.log(`[TWILIO STOP] Processing recording ${recordings.indexOf(recording) + 1}/${recordings.length}:`);
        console.log(`[TWILIO STOP]   - SID: ${recording.sid}`);
        console.log(`[TWILIO STOP]   - Status: ${recording.status}`);
        console.log(`[TWILIO STOP]   - Type: ${recording.type}`);
        console.log(`[TWILIO STOP]   - Track Name: ${recording.trackName}`);
        console.log(`[TWILIO STOP]   - Codec: ${recording.codec}`);
        console.log(`[TWILIO STOP]   - Duration: ${recording.duration} seconds`);
        console.log(`[TWILIO STOP]   - Size: ${recording.size} bytes`);
        console.log(`[TWILIO STOP]   - Links:`, JSON.stringify(recording.links, null, 2));
        
        const participant = participants.find(p => 
          recording.groupingSids?.participant_sid === p.sid
        );

        const identity = participant?.identity || 'unknown';
        const filename = `${identity}_${recording.trackName || 'track'}_${recording.sid}.${recording.codec || 'mka'}`;
        const filepath = path.join(recordingDir, filename);

        console.log(`[TWILIO STOP] Downloading recording:`);
        console.log(`[TWILIO STOP]   - Participant: ${identity}`);
        console.log(`[TWILIO STOP]   - Filename: ${filename}`);
        console.log(`[TWILIO STOP]   - Path: ${filepath}`);

        // Download the recording
        // The recording.links.media already contains the full path
        const mediaUrl = recording.links.media.startsWith('http') 
          ? recording.links.media 
          : `https://video.twilio.com${recording.links.media}`;
        
        console.log(`[TWILIO STOP]   - URL: ${mediaUrl}`);
        
        const response = await axios({
          method: 'GET',
          url: mediaUrl,
          responseType: 'stream',
          auth: {
            username: process.env.TWILIO_ACCOUNT_SID,
            password: process.env.TWILIO_AUTH_TOKEN
          }
        });

        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        downloadedFiles.push({
          identity,
          filepath,
          filename,
          duration: recording.duration,
          size: recording.size
        });

        console.log(`[TWILIO STOP] Successfully downloaded: ${filename}`);
      }

      // Clean up
      twilioRooms.delete(roomId);
      console.log(`[TWILIO STOP] Removed room from active rooms Map`);

      console.log(`[TWILIO STOP] Download complete. Total files: ${downloadedFiles.length}`);
      
      // Start transcription asynchronously (don't block the response)
      if (downloadedFiles.length > 0) {
        console.log(`[TWILIO STOP] Starting automatic transcription in background...`);
        
        // Run transcription in background, don't await
        transcribeTwilioRecording(roomId)
          .then(result => {
            console.log(`[TWILIO STOP ASYNC] Transcription completed successfully for room ${roomId}`);
            console.log(`[TWILIO STOP ASYNC] Transcript saved to: ${result.readablePath}`);
          })
          .catch(error => {
            console.error(`[TWILIO STOP ASYNC ERROR] Transcription failed for room ${roomId}:`, error.message);
          });
        
        console.log(`[TWILIO STOP] Transcription started in background`);
      }
      
      console.log(`[TWILIO STOP] ========================================`);

      // Send response immediately without waiting for transcription
      res.json({
        success: true,
        recordings: downloadedFiles,
        roomSid: roomInfo.twilioRoomSid,
        message: downloadedFiles.length > 0 
          ? 'Recordings saved. Transcription in progress (check back in 10-30 seconds).'
          : 'Recording stopped.'
      });

    } catch (error) {
      console.error('[TWILIO STOP ERROR] ========================================');
      console.error('[TWILIO STOP ERROR] Failed:', error.message);
      console.error('[TWILIO STOP ERROR] Stack:', error.stack);
      console.error('[TWILIO STOP ERROR] ========================================');
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Webhook for status updates
  app.post('/api/twilio/webhook', (req, res) => {
    // Check if body exists before accessing properties
    if (req.body) {
      console.log('[TWILIO WEBHOOK]', req.body.StatusCallbackEvent || 'No event', '-', req.body.RoomName || 'No room');
    } else {
      console.log('[TWILIO WEBHOOK] Empty webhook call');
    }
    res.sendStatus(200);
  });

  // Get recording status
  app.get('/api/twilio/status/:roomId', (req, res) => {
    const { roomId } = req.params;
    const roomInfo = twilioRooms.get(roomId);
    
    if (!roomInfo) {
      return res.status(404).json({ 
        success: false, 
        error: 'Room not found' 
      });
    }

    res.json({
      success: true,
      active: true,
      roomSid: roomInfo.twilioRoomSid,
      roomName: roomInfo.twilioRoomName,
      duration: Math.floor((Date.now() - roomInfo.startTime) / 1000)
    });
  });

  // List all recordings
  app.get('/api/recordings', async (req, res) => {
    try {
      const recordingsDir = path.join(__dirname, 'recordings');
      
      // Ensure directory exists
      await fs.ensureDir(recordingsDir);
      
      // Get all room directories
      const roomDirs = await fs.readdir(recordingsDir);
      const recordings = [];
      
      for (const roomId of roomDirs) {
        if (roomId === 'temp') continue; // Skip temp directory
        
        const roomPath = path.join(recordingsDir, roomId);
        const stat = await fs.stat(roomPath);
        
        if (stat.isDirectory()) {
          const twilioPath = path.join(roomPath, 'twilio');
          
          // Check for transcript files
          const transcriptPath = path.join(roomPath, 'twilio_transcript.txt');
          const transcriptJsonPath = path.join(roomPath, 'twilio_transcript.json');
          const hasTranscript = await fs.pathExists(transcriptPath);
          
          if (await fs.pathExists(twilioPath)) {
            const files = await fs.readdir(twilioPath);
            const audioFiles = files.filter(f => 
              f.endsWith('.mka') || f.endsWith('.mp4') || f.endsWith('.webm')
            );
            
            if (audioFiles.length > 0 || hasTranscript) {
              const roomStat = await fs.stat(twilioPath);
              recordings.push({
                roomId,
                date: roomStat.mtime,
                files: audioFiles,
                path: `/api/recordings/${roomId}`,
                hasTranscript,
                transcriptPath: hasTranscript ? `/api/transcript/${roomId}` : null
              });
            }
          }
        }
      }
      
      // Sort by date, newest first
      recordings.sort((a, b) => b.date - a.date);
      
      res.json({
        success: true,
        recordings
      });
      
    } catch (error) {
      console.error('[API ERROR] Failed to list recordings:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // Serve recording files
  app.get('/api/recordings/:roomId/:filename', async (req, res) => {
    try {
      const { roomId, filename } = req.params;
      const filepath = path.join(__dirname, 'recordings', roomId, 'twilio', filename);
      
      if (!await fs.pathExists(filepath)) {
        return res.status(404).json({
          success: false,
          error: 'Recording not found'
        });
      }
      
      // Send the file
      res.sendFile(filepath);
      
    } catch (error) {
      console.error('[API ERROR] Failed to serve recording:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // Serve transcript files
  app.get('/api/transcript/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;
      const format = req.query.format || 'text'; // 'text' or 'json'
      
      const filename = format === 'json' ? 'twilio_transcript.json' : 'twilio_transcript.txt';
      const filepath = path.join(__dirname, 'recordings', roomId, filename);
      
      if (!await fs.pathExists(filepath)) {
        return res.status(404).json({
          success: false,
          error: 'Transcript not found'
        });
      }
      
      if (format === 'json') {
        const data = await fs.readJson(filepath);
        res.json(data);
      } else {
        const text = await fs.readFile(filepath, 'utf-8');
        res.type('text/plain').send(text);
      }
      
    } catch (error) {
      console.error('[API ERROR] Failed to serve transcript:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  console.log('[TWILIO] Endpoints registered');
}

module.exports = createTwilioEndpoints;

// To add to your server.js:
/*
const createTwilioEndpoints = require('./twilio-endpoints');
createTwilioEndpoints(app);
*/