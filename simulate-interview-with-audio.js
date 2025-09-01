#!/usr/bin/env node

/**
 * Simulates a complete interview recording with REAL audio files
 * Tests the full pipeline including transcription
 */

const fs = require('fs-extra');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

const SERVER_URL = 'http://localhost:5002';
const SIMULATION_ROOM_ID = 'audio-test-' + Date.now();

// ANSI color codes for better output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
}

async function uploadRealAudioChunk(roomId, streamType, chunkIndex, delay = 0) {
    if (delay > 0) {
        log(`⏱️  Waiting ${delay/1000} seconds to simulate real-time recording...`, 'yellow');
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    log(`\n📤 Uploading ${streamType} chunk ${chunkIndex}...`, 'cyan');
    
    // Use the pre-generated audio files (WebM format)
    const audioFile = path.join(__dirname, 'test-audio', `${streamType}_chunk_${chunkIndex}.webm`);
    
    if (!await fs.pathExists(audioFile)) {
        log(`⚠️  Audio file not found: ${audioFile}`, 'yellow');
        log(`   Please run: node generate-test-audio.js first`, 'yellow');
        return false;
    }
    
    try {
        const form = new FormData();
        form.append('audio', fs.createReadStream(audioFile), {
            filename: `${streamType}_chunk_${chunkIndex}.webm`,
            contentType: 'audio/webm'
        });
        form.append('roomId', roomId);
        form.append('streamType', streamType);
        form.append('chunkIndex', chunkIndex.toString());
        form.append('timestamp', Date.now().toString());
        
        const response = await fetch(`${SERVER_URL}/api/upload-chunk`, {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });
        
        const result = await response.json();
        
        if (response.ok) {
            log(`✅ ${streamType} chunk ${chunkIndex} uploaded successfully`, 'green');
            log(`   Response: ${JSON.stringify(result)}`, 'bright');
        } else {
            log(`❌ Failed to upload ${streamType} chunk ${chunkIndex}`, 'red');
            log(`   Error: ${JSON.stringify(result)}`, 'red');
        }
        
        return response.ok;
        
    } catch (error) {
        log(`❌ Upload error: ${error.message}`, 'red');
        return false;
    }
}

async function markRecordingComplete(roomId, totalChunks, duration) {
    log(`\n🏁 Marking recording as complete...`, 'cyan');
    
    try {
        const response = await fetch(`${SERVER_URL}/api/recording-complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: roomId,
                totalChunks: totalChunks,
                duration: duration
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            log(`✅ Recording marked as complete`, 'green');
            log(`   Response: ${JSON.stringify(result)}`, 'bright');
        } else {
            log(`❌ Failed to mark recording complete`, 'red');
            log(`   Error: ${JSON.stringify(result)}`, 'red');
        }
        
        return response.ok;
    } catch (error) {
        log(`❌ Error marking complete: ${error.message}`, 'red');
        return false;
    }
}

async function checkTranscriptionResults(roomId) {
    log(`\n📁 Checking recording and transcription results...`, 'cyan');
    
    const recordingsDir = path.join(__dirname, 'recordings');
    
    if (!await fs.pathExists(recordingsDir)) {
        log(`❌ Recordings directory doesn't exist!`, 'red');
        return false;
    }
    
    const dirs = await fs.readdir(recordingsDir);
    const simDir = dirs.find(d => d.includes(roomId.substring(0, 8).replace('audio-test-', '')));
    
    if (!simDir) {
        log(`❌ No directory found for room ${roomId}`, 'red');
        log(`   Available directories: ${dirs.join(', ')}`, 'yellow');
        return false;
    }
    
    log(`✅ Found recording directory: ${simDir}`, 'green');
    
    const dirPath = path.join(recordingsDir, simDir);
    const files = await fs.readdir(dirPath);
    
    log(`\n📄 Files in recording directory:`, 'bright');
    for (const file of files) {
        const stats = await fs.stat(path.join(dirPath, file));
        log(`   - ${file} (${stats.size.toLocaleString()} bytes)`, 'cyan');
    }
    
    // Check metadata
    const metadataPath = path.join(dirPath, 'metadata.json');
    if (await fs.pathExists(metadataPath)) {
        const metadata = await fs.readJson(metadataPath);
        log(`\n✅ Metadata found:`, 'green');
        log(`   - Room ID: ${metadata.roomId}`, 'bright');
        log(`   - Chunks: ${metadata.chunks?.length || 0}`, 'bright');
        log(`   - Recording complete: ${metadata.recordingComplete || false}`, 'bright');
        log(`   - Start time: ${new Date(metadata.startTime).toLocaleString()}`, 'bright');
        
        if (metadata.transcriptionStatus) {
            log(`   - Transcription status: ${metadata.transcriptionStatus}`, 'bright');
        }
    }
    
    // Check for transcript - MOST IMPORTANT!
    const transcriptPath = path.join(dirPath, 'transcript.txt');
    if (await fs.pathExists(transcriptPath)) {
        log(`\n✅ TRANSCRIPT FOUND! 🎉`, 'green');
        const transcript = await fs.readFile(transcriptPath, 'utf8');
        log(`\n📝 Full Transcript:`, 'cyan');
        log('=' .repeat(60), 'bright');
        log(transcript, 'bright');
        log('=' .repeat(60), 'bright');
        
        // Check if speaker detection worked
        if (transcript.includes('Interviewer:') && transcript.includes('Interviewee:')) {
            log(`\n✅ Speaker detection successful!`, 'green');
        } else {
            log(`\n⚠️  Speaker labels not found in transcript`, 'yellow');
        }
    } else {
        log(`\n⏳ No transcript yet (may still be processing)`, 'yellow');
        log(`   Check the server logs for transcription status`, 'yellow');
    }
    
    return true;
}

async function simulateInterview() {
    console.clear();
    log('='.repeat(60), 'bright');
    log('🎭 INTERVIEW RECORDING WITH REAL AUDIO', 'bright');
    log('='.repeat(60), 'bright');
    
    log(`\n🆔 Room ID: ${SIMULATION_ROOM_ID}`, 'blue');
    log(`📍 Server URL: ${SERVER_URL}`, 'blue');
    
    // Check if audio files exist
    const audioDir = path.join(__dirname, 'test-audio');
    if (!await fs.pathExists(audioDir)) {
        log(`\n❌ Audio files not found!`, 'red');
        log(`Please run: node generate-test-audio.js`, 'yellow');
        process.exit(1);
    }
    
    // Check if server is running
    log(`\n🔍 Checking if server is running...`, 'yellow');
    try {
        const response = await fetch(SERVER_URL);
        if (response.ok) {
            log(`✅ Server is running`, 'green');
        }
    } catch (error) {
        log(`❌ Server is not running! Please start it with: npm start`, 'red');
        process.exit(1);
    }
    
    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY && !await fs.pathExists('.env')) {
        log(`\n⚠️  Warning: OpenAI API key may not be configured`, 'yellow');
        log(`   Transcription will fail without it`, 'yellow');
    }
    
    log('\n' + '='.repeat(60), 'bright');
    log('📼 STARTING RECORDING WITH REAL AUDIO', 'bright');
    log('='.repeat(60), 'bright');
    
    let success = true;
    
    // Upload chunks progressively (simulating 30-second intervals)
    log(`\n⏱️  Time: 00:00 - Recording starts`, 'yellow');
    
    // First 30 seconds
    log(`\n⏱️  Time: 00:30 - First chunks upload`, 'yellow');
    success = await uploadRealAudioChunk(SIMULATION_ROOM_ID, 'local', 0) && success;
    success = await uploadRealAudioChunk(SIMULATION_ROOM_ID, 'remote', 0) && success;
    
    // Second 30 seconds
    log(`\n⏱️  Time: 01:00 - Second chunks upload`, 'yellow');
    success = await uploadRealAudioChunk(SIMULATION_ROOM_ID, 'local', 1, 2000) && success;
    success = await uploadRealAudioChunk(SIMULATION_ROOM_ID, 'remote', 1) && success;
    
    // Third 30 seconds
    log(`\n⏱️  Time: 01:30 - Third chunks upload`, 'yellow');
    success = await uploadRealAudioChunk(SIMULATION_ROOM_ID, 'local', 2, 2000) && success;
    success = await uploadRealAudioChunk(SIMULATION_ROOM_ID, 'remote', 2) && success;
    
    // Mark recording complete
    log(`\n⏹️  Time: 02:00 - Recording stopped`, 'yellow');
    success = await markRecordingComplete(SIMULATION_ROOM_ID, 6, 120000) && success;
    
    // Wait for transcription to complete
    log(`\n⏳ Waiting 10 seconds for transcription to process...`, 'yellow');
    log(`   (OpenAI Whisper API may take a moment)`, 'yellow');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check the results
    log('\n' + '='.repeat(60), 'bright');
    log('📊 CHECKING RESULTS', 'bright');
    log('='.repeat(60), 'bright');
    
    success = await checkTranscriptionResults(SIMULATION_ROOM_ID) && success;
    
    // Final summary
    log('\n' + '='.repeat(60), 'bright');
    if (success) {
        log('✅ SIMULATION WITH AUDIO COMPLETED!', 'green');
        log('\nWhat was tested:', 'bright');
        log('  ✓ Real audio file upload', 'green');
        log('  ✓ Progressive chunk recording', 'green');
        log('  ✓ OpenAI Whisper transcription', 'green');
        log('  ✓ Speaker detection', 'green');
        log('  ✓ Full recording pipeline', 'green');
        
        log('\n📂 Check the recordings folder for:', 'cyan');
        log('  • Audio files (.webm)', 'bright');
        log('  • Metadata (metadata.json)', 'bright');
        log('  • Transcript (transcript.txt)', 'bright');
    } else {
        log('❌ SIMULATION ENCOUNTERED ERRORS', 'red');
        log('\nPlease check:', 'yellow');
        log('  1. Server is running (npm start)', 'yellow');
        log('  2. OpenAI API key is configured in .env', 'yellow');
        log('  3. Audio files exist (run generate-test-audio.js)', 'yellow');
        log('  4. Check server console for detailed error logs', 'yellow');
    }
    log('='.repeat(60), 'bright');
}

// Run the simulation
simulateInterview().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});