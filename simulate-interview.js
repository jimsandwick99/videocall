#!/usr/bin/env node

/**
 * Simulates a complete interview recording and transcription
 * without needing actual devices or browser
 */

const fs = require('fs-extra');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

const SERVER_URL = 'http://localhost:5002';
const SIMULATION_ROOM_ID = 'simulation-' + Date.now();

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

async function createFakeAudioFile(speakerType, chunkIndex) {
    // Create a fake WebM audio file with some data
    // In a real scenario, this would be actual audio data
    const fakeAudioData = Buffer.concat([
        Buffer.from('WEBM'), // Fake WebM header
        Buffer.from(`${speakerType}_audio_chunk_${chunkIndex}_`),
        Buffer.from(new Array(1000).fill(0)), // Some bulk data
        Buffer.from(`_timestamp_${Date.now()}`)
    ]);
    
    const filename = `fake_${speakerType}_${chunkIndex}.webm`;
    const filepath = path.join(__dirname, filename);
    await fs.writeFile(filepath, fakeAudioData);
    
    return filepath;
}

async function simulateChunkUpload(roomId, streamType, chunkIndex, delay = 0) {
    if (delay > 0) {
        log(`⏱️  Waiting ${delay/1000} seconds to simulate real-time recording...`, 'yellow');
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    log(`\n📤 Uploading ${streamType} chunk ${chunkIndex}...`, 'cyan');
    
    const audioFile = await createFakeAudioFile(streamType, chunkIndex);
    
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
        
        // Clean up temp file
        await fs.remove(audioFile);
        return response.ok;
        
    } catch (error) {
        log(`❌ Upload error: ${error.message}`, 'red');
        await fs.remove(audioFile);
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

async function checkRecordingFiles(roomId) {
    log(`\n📁 Checking recording files...`, 'cyan');
    
    const recordingsDir = path.join(__dirname, 'recordings');
    
    if (!await fs.pathExists(recordingsDir)) {
        log(`❌ Recordings directory doesn't exist!`, 'red');
        return false;
    }
    
    const dirs = await fs.readdir(recordingsDir);
    const simDir = dirs.find(d => d.includes(roomId.substring(0, 8).replace('simulation-', '')));
    
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
        log(`   - ${file} (${stats.size} bytes)`, 'cyan');
    }
    
    // Check metadata
    const metadataPath = path.join(dirPath, 'metadata.json');
    if (await fs.pathExists(metadataPath)) {
        const metadata = await fs.readJson(metadataPath);
        log(`\n✅ Metadata found:`, 'green');
        log(`   - Room ID: ${metadata.roomId}`, 'bright');
        log(`   - Chunks: ${metadata.chunks?.length || 0}`, 'bright');
        log(`   - Start time: ${new Date(metadata.startTime).toLocaleString()}`, 'bright');
        
        if (metadata.chunks) {
            log(`\n📊 Chunk details:`, 'cyan');
            metadata.chunks.forEach(chunk => {
                log(`   - ${chunk.filename}: ${chunk.streamType}, ${chunk.size} bytes`, 'bright');
            });
        }
    }
    
    // Check for transcript
    const transcriptPath = path.join(dirPath, 'transcript.txt');
    if (await fs.pathExists(transcriptPath)) {
        log(`\n✅ Transcript found!`, 'green');
        const transcript = await fs.readFile(transcriptPath, 'utf8');
        log(`\n📝 Transcript preview:`, 'cyan');
        log(transcript.substring(0, 500) + '...', 'bright');
    } else {
        log(`\n⚠️  No transcript yet (will be created after recording completes)`, 'yellow');
    }
    
    return true;
}

async function simulateInterview() {
    console.clear();
    log('='.repeat(60), 'bright');
    log('🎭 INTERVIEW RECORDING SIMULATION', 'bright');
    log('='.repeat(60), 'bright');
    
    log(`\n🆔 Simulated Room ID: ${SIMULATION_ROOM_ID}`, 'blue');
    log(`📍 Server URL: ${SERVER_URL}`, 'blue');
    
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
    
    log('\n' + '='.repeat(60), 'bright');
    log('📼 STARTING SIMULATED RECORDING', 'bright');
    log('='.repeat(60), 'bright');
    
    let success = true;
    
    // Simulate initial recording (first 30 seconds)
    log(`\n⏱️  Time: 00:00 - Recording starts`, 'yellow');
    
    // Simulate 30 seconds passing and first chunks uploading
    log(`\n⏱️  Time: 00:30 - First chunks upload`, 'yellow');
    success = await simulateChunkUpload(SIMULATION_ROOM_ID, 'local', 0) && success;
    success = await simulateChunkUpload(SIMULATION_ROOM_ID, 'remote', 0) && success;
    
    // Simulate another 30 seconds (1 minute total)
    log(`\n⏱️  Time: 01:00 - Second chunks upload`, 'yellow');
    success = await simulateChunkUpload(SIMULATION_ROOM_ID, 'local', 1, 2000) && success;
    success = await simulateChunkUpload(SIMULATION_ROOM_ID, 'remote', 1) && success;
    
    // Simulate another 30 seconds (1:30 total)
    log(`\n⏱️  Time: 01:30 - Third chunks upload`, 'yellow');
    success = await simulateChunkUpload(SIMULATION_ROOM_ID, 'local', 2, 2000) && success;
    success = await simulateChunkUpload(SIMULATION_ROOM_ID, 'remote', 2) && success;
    
    // Simulate stopping the recording
    log(`\n⏹️  Time: 02:00 - Recording stopped`, 'yellow');
    success = await markRecordingComplete(SIMULATION_ROOM_ID, 6, 120000) && success;
    
    // Wait a bit for transcription to process (if API key is configured)
    log(`\n⏳ Waiting 3 seconds for processing...`, 'yellow');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check the results
    log('\n' + '='.repeat(60), 'bright');
    log('📊 CHECKING RESULTS', 'bright');
    log('='.repeat(60), 'bright');
    
    success = await checkRecordingFiles(SIMULATION_ROOM_ID) && success;
    
    // Final summary
    log('\n' + '='.repeat(60), 'bright');
    if (success) {
        log('✅ SIMULATION COMPLETED SUCCESSFULLY!', 'green');
        log('\nWhat was tested:', 'bright');
        log('  ✓ Server connectivity', 'green');
        log('  ✓ Chunk upload API', 'green');
        log('  ✓ Directory creation', 'green');
        log('  ✓ Metadata storage', 'green');
        log('  ✓ Recording completion', 'green');
        log('  ✓ File organization', 'green');
        
        log('\n📂 Check the recordings folder to see the saved files!', 'cyan');
        log(`   Path: ./recordings/interview_*_${SIMULATION_ROOM_ID.substring(0, 8).replace('simulation-', '')}*/`, 'bright');
    } else {
        log('❌ SIMULATION ENCOUNTERED ERRORS', 'red');
        log('\nPlease check:', 'yellow');
        log('  1. Server is running (npm start)', 'yellow');
        log('  2. Port 5002 is correct', 'yellow');
        log('  3. recordings/ folder exists and is writable', 'yellow');
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