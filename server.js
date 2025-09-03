const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const multer = require('multer');
const fs = require('fs-extra');
const OpenAI = require('openai');

// Load environment variables
require('dotenv').config();

// Import Twilio endpoints
const createTwilioEndpoints = require('./twilio-endpoints');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3001;

const rooms = new Map();
const roomToDirectory = new Map(); // Maps roomId to directory name

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // For multipart forms, the text fields might not be parsed yet
    // We'll use a temporary directory and move it later
    const tempDir = path.join(__dirname, 'recordings', 'temp');
    
    try {
      await fs.ensureDir(tempDir);
      cb(null, tempDir);
    } catch (error) {
      console.error(`[MULTER ERROR] Failed to create temp directory: ${error.message}`);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Generate a unique filename for now
    const timestamp = Date.now();
    const filename = `temp_${timestamp}_${file.originalname}`;
    cb(null, filename);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit per chunk
});

app.use(express.static('public'));
app.use(express.json());

// Add Twilio endpoints
try {
  createTwilioEndpoints(app);
  console.log('[SERVER] Twilio endpoints added successfully');
} catch (error) {
  console.error('[SERVER ERROR] Failed to add Twilio endpoints:', error.message);
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/create-room', (req, res) => {
  const roomId = uuidv4();
  rooms.set(roomId, { users: [], createdAt: Date.now() });
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers.host;
  res.json({ roomId, url: `${protocol}://${host}/room/${roomId}` });
});

app.get('/room/:roomId', (req, res) => {
  const { roomId } = req.params;
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { users: [], createdAt: Date.now() });
  }
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// Handle chunk uploads - DEPRECATED (using Twilio recording now)
/*
app.post('/api/upload-chunk', upload.single('audio'), async (req, res) => {
  try {
    const { roomId, streamType, chunkIndex, timestamp } = req.body;
    
    console.log(`[UPLOAD] Received ${streamType} chunk ${chunkIndex} for room ${roomId}`);
    
    if (!req.file) {
      console.error('[UPLOAD ERROR] No file received in request');
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    console.log(`[UPLOAD] Temp file: ${req.file.filename}, size: ${req.file.size} bytes`);
    
    // Get or create directory mapping
    let dirName = roomToDirectory.get(roomId);
    if (!dirName) {
      // First upload for this room, create proper directory
      const date = new Date();
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
      dirName = `interview_${dateStr}_${timeStr}_${roomId.substring(0, 8)}`;
      roomToDirectory.set(roomId, dirName);
      console.log(`[UPLOAD] Created directory name: ${dirName} for room ${roomId}`);
    }
    
    // Ensure the proper directory exists
    const properDir = path.join(__dirname, 'recordings', dirName);
    await fs.ensureDir(properDir);
    
    // Generate proper filename
    const properFilename = `${streamType}_part${chunkIndex.toString().padStart(2, '0')}_${Date.now()}.webm`;
    const properPath = path.join(properDir, properFilename);
    
    // Move the file from temp to proper location
    console.log(`[UPLOAD] Moving file from temp to: ${properPath}`);
    await fs.move(req.file.path, properPath);
    
    // Store metadata about the chunk
    const metadataPath = path.join(properDir, 'metadata.json');
    let metadata = {};
    
    console.log(`[UPLOAD] Checking metadata at: ${metadataPath}`);
    
    if (await fs.pathExists(metadataPath)) {
      metadata = await fs.readJson(metadataPath);
      console.log(`[UPLOAD] Existing metadata found with ${metadata.chunks?.length || 0} chunks`);
    } else {
      console.log(`[UPLOAD] Creating new metadata file`);
      metadata.roomId = roomId;
      metadata.directory = dirName;
      metadata.startTime = Date.now();
    }
    
    if (!metadata.chunks) metadata.chunks = [];
    
    metadata.chunks.push({
      filename: properFilename,
      streamType,
      chunkIndex,
      timestamp,
      size: req.file.size
    });
    
    await fs.writeJson(metadataPath, metadata, { spaces: 2 });
    console.log(`[UPLOAD] Metadata updated successfully. Total chunks: ${metadata.chunks.length}`);
    
    res.json({ success: true, message: 'Chunk uploaded successfully' });
  } catch (error) {
    console.error('[UPLOAD ERROR] Error uploading chunk:', error);
    console.error('[UPLOAD ERROR] Stack trace:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});
*/

// Handle recording completion - DEPRECATED (using Twilio recording now)
/*
app.post('/api/recording-complete', express.json(), async (req, res) => {
  try {
    const { roomId, totalChunks, duration } = req.body;
    
    console.log(`[RECORDING] Complete for room ${roomId}: ${totalChunks} chunks, ${duration}ms duration`);
    
    // Get the actual directory name from mapping
    const dirName = roomToDirectory.get(roomId);
    if (!dirName) {
      console.warn(`[RECORDING WARNING] No directory mapping found for room ${roomId}, checking for any existing directories`);
      // Try to find a directory that contains this roomId
      const recordingsDir = path.join(__dirname, 'recordings');
      const dirs = await fs.readdir(recordingsDir);
      const matchingDir = dirs.find(d => d.includes(roomId.substring(0, 8)));
      if (!matchingDir) {
        return res.status(404).json({ success: false, error: 'Recording directory not found' });
      }
      roomToDirectory.set(roomId, matchingDir);
    }
    
    const recordingDir = path.join(__dirname, 'recordings', dirName || roomId);
    const metadataPath = path.join(recordingDir, 'metadata.json');
    
    console.log(`[RECORDING] Using recording directory: ${recordingDir}`);
    
    if (!await fs.pathExists(recordingDir)) {
      console.error(`[RECORDING ERROR] Recording directory does not exist: ${recordingDir}`);
      return res.status(404).json({ success: false, error: 'Recording directory not found' });
    }
    
    let metadata = {};
    
    if (await fs.pathExists(metadataPath)) {
      metadata = await fs.readJson(metadataPath);
      console.log(`[RECORDING] Found metadata with ${metadata.chunks?.length || 0} chunks`);
    } else {
      console.warn(`[RECORDING WARNING] No metadata file found at: ${metadataPath}`);
    }
    
    metadata.recordingComplete = true;
    metadata.totalChunks = totalChunks;
    metadata.duration = duration;
    metadata.completedAt = Date.now();
    
    await fs.writeJson(metadataPath, metadata, { spaces: 2 });
    console.log(`[RECORDING] Metadata marked as complete`);
    
    // Trigger transcription process
    console.log(`[RECORDING] Starting transcription process...`);
    processTranscription(roomId, dirName || roomId).catch(error => {
      console.error('[TRANSCRIPTION ERROR] Failed to process transcription:', error);
      console.error('[TRANSCRIPTION ERROR] Stack trace:', error.stack);
    });
    
    res.json({ success: true, message: 'Recording marked as complete, transcription started' });
  } catch (error) {
    console.error('[RECORDING ERROR] Error marking recording complete:', error);
    console.error('[RECORDING ERROR] Stack trace:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});
*/

// Handle abrupt recording end - DEPRECATED (using Twilio recording now)
/*
app.post('/api/recording-abort', upload.none(), async (req, res) => {
  try {
    const { roomId, abruptEnd, lastChunk } = req.body;
    
    console.log(`Recording aborted for room ${roomId} at chunk ${lastChunk}`);
    
    // Get the actual directory name from mapping
    const dirName = roomToDirectory.get(roomId);
    if (!dirName) {
      console.log(`No recording directory found for room ${roomId}, skipping abort handling`);
      return res.json({ success: true });
    }
    
    const recordingDir = path.join(__dirname, 'recordings', dirName);
    
    // Only try to update metadata if the recording directory exists
    if (await fs.pathExists(recordingDir)) {
      const metadataPath = path.join(recordingDir, 'metadata.json');
      let metadata = {};
      
      if (await fs.pathExists(metadataPath)) {
        metadata = await fs.readJson(metadataPath);
      }
      
      metadata.abruptEnd = true;
      metadata.lastChunk = lastChunk;
      metadata.abortedAt = Date.now();
      
      await fs.writeJson(metadataPath, metadata, { spaces: 2 });
      console.log(`Updated abort metadata for room ${roomId} in directory ${dirName}`);
    } else {
      console.log(`Recording directory ${recordingDir} does not exist, skipping abort handling`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error handling recording abort:', error);
    res.json({ success: true }); // Return success anyway to avoid client errors
  }
});
*/

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  let currentRoom = null;

  socket.on('join-room', async (roomId) => {
    console.log(`User ${socket.id} joining room ${roomId}`);
    currentRoom = roomId;
    socket.join(roomId);
    
    // Store room in rooms map if not exists
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        id: roomId,
        users: [],
        createdAt: Date.now()
      });
    }
    
    const room = rooms.get(roomId);
    room.users.push(socket.id);
    
    // Get all clients in the room
    const clientsInRoom = await io.in(roomId).allSockets();
    console.log(`Room ${roomId} now has ${clientsInRoom.size} users`);
    
    // Notify the joining user that room was joined successfully
    socket.emit('room-joined', { roomId, users: Array.from(clientsInRoom) });
    
    // Notify other users in the room
    if (clientsInRoom.size > 1) {
      socket.to(roomId).emit('user-connected', socket.id);
    }
  });
  
  // Handle offer/answer/ICE candidates
  socket.on('offer', (data) => {
    console.log(`Relaying offer from ${socket.id} in room ${data.roomId}`);
    socket.to(data.roomId).emit('offer', {
      offer: data.offer,
      from: socket.id
    });
  });
  
  socket.on('answer', (data) => {
    console.log(`Relaying answer from ${socket.id} to ${data.to}`);
    io.to(data.to).emit('answer', {
      answer: data.answer,
      from: socket.id
    });
  });
  
  socket.on('ice-candidate', (data) => {
    socket.to(data.roomId).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });
  
  // Handle audio mute state
  socket.on('audio-state', (data) => {
    console.log(`User ${socket.id} audio state: ${data.muted ? 'muted' : 'unmuted'}`);
    socket.to(data.roomId).emit('audio-state', {
      userId: socket.id,
      muted: data.muted
    });
  });
  
  // Handle recording events
  socket.on('start-recording', (data) => {
    console.log(`[RECORDING] Interviewer ${socket.id} started recording in room ${data.roomId}`);
    // Notify all other users in the room to join Twilio recording
    socket.to(data.roomId).emit('start-recording', {
      roomId: data.roomId
    });
  });
  
  socket.on('stop-recording', (data) => {
    console.log(`[RECORDING] Interviewer ${socket.id} stopped recording in room ${data.roomId}`);
    // Notify all other users in the room to leave Twilio recording
    socket.to(data.roomId).emit('stop-recording', {
      roomId: data.roomId
    });
  });
  
  // Handle real-time transcript relay
  socket.on('transcript', (data) => {
    console.log(`[TRANSCRIPT] Relaying transcript from ${socket.id} in room ${data.roomId}`);
    // Relay transcript to other participants in the room
    socket.to(data.roomId).emit('transcript', {
      speaker: data.speaker,
      text: data.text,
      timestamp: data.timestamp,
      from: socket.id
    });
  });
  
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id} from room ${currentRoom}`);
    if (currentRoom) {
      socket.to(currentRoom).emit('user-disconnected', socket.id);
      
      // Remove user from room
      const room = rooms.get(currentRoom);
      if (room) {
        room.users = room.users.filter(id => id !== socket.id);
        if (room.users.length === 0) {
          console.log(`Room ${currentRoom} is now empty`);
        }
      }
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.length === 0 && now - room.createdAt > 3600000) {
      rooms.delete(roomId);
    }
  }
}, 300000);

// Process transcription for a room
async function processTranscription(roomId, dirName) {
  console.log(`[TRANSCRIPTION] Starting transcription for room ${roomId}`);
  
  const recordingDir = path.join(__dirname, 'recordings', dirName || roomId);
  const metadataPath = path.join(recordingDir, 'metadata.json');
  
  console.log(`[TRANSCRIPTION] Recording directory: ${recordingDir}`);
  console.log(`[TRANSCRIPTION] Metadata path: ${metadataPath}`);
  
  if (!await fs.pathExists(metadataPath)) {
    console.error(`[TRANSCRIPTION ERROR] No metadata found for room ${roomId}`);
    return;
  }
  
  const metadata = await fs.readJson(metadataPath);
  console.log(`[TRANSCRIPTION] Loaded metadata with ${metadata.chunks?.length || 0} chunks`);
  
  if (!metadata.chunks || metadata.chunks.length === 0) {
    console.error(`[TRANSCRIPTION ERROR] No audio chunks found for room ${roomId}`);
    return;
  }
  
  // Group chunks by stream type
  const localChunks = metadata.chunks.filter(c => c.streamType === 'local').sort((a, b) => a.chunkIndex - b.chunkIndex);
  const remoteChunks = metadata.chunks.filter(c => c.streamType === 'remote').sort((a, b) => a.chunkIndex - b.chunkIndex);
  
  console.log(`[TRANSCRIPTION] Found ${localChunks.length} local chunks and ${remoteChunks.length} remote chunks`);
  
  const transcript = {
    roomId,
    startTime: metadata.chunks[0].timestamp,
    endTime: metadata.completedAt || metadata.abortedAt,
    duration: metadata.duration,
    speakers: {}
  };
  
  // Process local speaker (interviewer)
  if (localChunks.length > 0) {
    console.log(`[TRANSCRIPTION] Processing ${localChunks.length} local audio chunks...`);
    transcript.speakers.interviewer = await transcribeChunks(recordingDir, localChunks, 'Interviewer');
  } else {
    console.warn(`[TRANSCRIPTION WARNING] No local chunks to transcribe`);
  }
  
  // Process remote speaker (interviewee)
  if (remoteChunks.length > 0) {
    console.log(`[TRANSCRIPTION] Processing ${remoteChunks.length} remote audio chunks...`);
    transcript.speakers.interviewee = await transcribeChunks(recordingDir, remoteChunks, 'Interviewee');
  } else {
    console.warn(`[TRANSCRIPTION WARNING] No remote chunks to transcribe`);
  }
  
  // Merge transcripts by timestamp
  transcript.merged = mergeTranscripts(transcript.speakers);
  
  // Save transcript
  const transcriptPath = path.join(recordingDir, 'transcript.json');
  await fs.writeJson(transcriptPath, transcript, { spaces: 2 });
  
  // Generate readable transcript
  const readableTranscript = generateReadableTranscript(transcript);
  const readablePath = path.join(recordingDir, 'transcript.txt');
  await fs.writeFile(readablePath, readableTranscript);
  
  console.log(`Transcription complete for room ${roomId}`);
  console.log(`Transcript saved to: ${readablePath}`);
  
  return transcript;
}

// Transcribe audio chunks using OpenAI Whisper
async function transcribeChunks(recordingDir, chunks, speakerLabel) {
  const transcriptions = [];
  
  console.log(`[WHISPER] Starting transcription for ${chunks.length} chunks (${speakerLabel})`);
  
  // Check if OpenAI API key is configured
  if (!process.env.OPENAI_API_KEY) {
    console.error('[WHISPER ERROR] OpenAI API key not configured in .env file');
    return transcriptions;
  }
  
  for (const chunk of chunks) {
    const audioPath = path.join(recordingDir, chunk.filename);
    
    try {
      console.log(`[WHISPER] Transcribing ${chunk.filename}...`);
      
      // Check if file exists
      if (!await fs.pathExists(audioPath)) {
        console.error(`[WHISPER ERROR] Audio file not found: ${audioPath}`);
        continue;
      }
      
      // Read the audio file
      const audioFile = await fs.readFile(audioPath);
      console.log(`[WHISPER] Read audio file: ${audioFile.length} bytes`);
      
      // Create a File object for OpenAI
      const file = new File([audioFile], chunk.filename, { type: 'audio/webm' });
      
      console.log(`[WHISPER] Sending to OpenAI Whisper API...`);
      
      // Send to Whisper API
      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        response_format: 'verbose_json',
        language: 'en' // Change if needed
      });
      
      console.log(`[WHISPER] Transcription successful for ${chunk.filename}: ${transcription.text?.substring(0, 50)}...`);
      
      transcriptions.push({
        chunkIndex: chunk.chunkIndex,
        timestamp: chunk.timestamp,
        text: transcription.text,
        segments: transcription.segments,
        speaker: speakerLabel
      });
      
    } catch (error) {
      console.error(`Error transcribing ${chunk.filename}:`, error.message);
      transcriptions.push({
        chunkIndex: chunk.chunkIndex,
        timestamp: chunk.timestamp,
        text: '[Transcription failed]',
        error: error.message,
        speaker: speakerLabel
      });
    }
  }
  
  return transcriptions;
}

// Merge transcripts from both speakers
function mergeTranscripts(speakers) {
  const allSegments = [];
  
  // Add interviewer segments
  if (speakers.interviewer) {
    speakers.interviewer.forEach(chunk => {
      if (chunk.segments) {
        chunk.segments.forEach(segment => {
          allSegments.push({
            ...segment,
            speaker: 'Interviewer',
            chunkTimestamp: chunk.timestamp
          });
        });
      }
    });
  }
  
  // Add interviewee segments
  if (speakers.interviewee) {
    speakers.interviewee.forEach(chunk => {
      if (chunk.segments) {
        chunk.segments.forEach(segment => {
          allSegments.push({
            ...segment,
            speaker: 'Interviewee',
            chunkTimestamp: chunk.timestamp
          });
        });
      }
    });
  }
  
  // Sort by timestamp
  allSegments.sort((a, b) => (a.chunkTimestamp + a.start * 1000) - (b.chunkTimestamp + b.start * 1000));
  
  return allSegments;
}

// Generate human-readable transcript
function generateReadableTranscript(transcript) {
  let output = `Interview Transcript\n`;
  output += `Room ID: ${transcript.roomId}\n`;
  output += `Duration: ${Math.round(transcript.duration / 1000)} seconds\n`;
  output += `Date: ${new Date(transcript.startTime).toLocaleString()}\n`;
  output += `${'='.repeat(50)}\n\n`;
  
  if (transcript.merged && transcript.merged.length > 0) {
    transcript.merged.forEach(segment => {
      const timestamp = formatTimestamp(segment.start);
      output += `[${timestamp}] ${segment.speaker}: ${segment.text}\n\n`;
    });
  } else {
    // Fallback to simple format if no segments
    if (transcript.speakers.interviewer) {
      output += `INTERVIEWER:\n`;
      transcript.speakers.interviewer.forEach(chunk => {
        output += `${chunk.text}\n\n`;
      });
    }
    
    if (transcript.speakers.interviewee) {
      output += `\nINTERVIEWEE:\n`;
      transcript.speakers.interviewee.forEach(chunk => {
        output += `${chunk.text}\n\n`;
      });
    }
  }
  
  return output;
}

// Format timestamp for display
function formatTimestamp(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// API endpoint to get transcript
app.get('/api/transcript/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const transcriptPath = path.join(__dirname, 'recordings', roomId, 'transcript.json');
  
  if (!await fs.pathExists(transcriptPath)) {
    return res.status(404).json({ error: 'Transcript not found' });
  }
  
  const transcript = await fs.readJson(transcriptPath);
  res.json(transcript);
});

// API endpoint to download transcript as text
app.get('/api/transcript/:roomId/download', async (req, res) => {
  const { roomId } = req.params;
  const transcriptPath = path.join(__dirname, 'recordings', roomId, 'transcript.txt');
  
  if (!await fs.pathExists(transcriptPath)) {
    return res.status(404).json({ error: 'Transcript not found' });
  }
  
  res.download(transcriptPath, `transcript_${roomId}.txt`);
});

httpServer.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`To use with ngrok: ngrok http ${PORT}`);
  console.log('='.repeat(60));
  console.log('Configuration:');
  console.log(`- OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Configured ✓' : 'NOT CONFIGURED ✗'}`);
  console.log(`- Recordings directory: ${path.join(__dirname, 'recordings')}`);
  console.log(`- Port: ${PORT}`);
  console.log('='.repeat(60));
  console.log('Logging prefixes:');
  console.log('- [UPLOAD] - Chunk upload events');
  console.log('- [RECORDING] - Recording completion events');
  console.log('- [TRANSCRIPTION] - Transcription process');
  console.log('- [WHISPER] - OpenAI Whisper API calls');
  console.log('- [MULTER] - File storage operations');
  console.log('='.repeat(60));
});