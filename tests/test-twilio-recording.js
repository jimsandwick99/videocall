#!/usr/bin/env node

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:5002';
const roomId = uuidv4();

console.log('========================================');
console.log('TWILIO RECORDING TEST');
console.log('========================================');
console.log('Room ID:', roomId);
console.log('');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testTwilioRecording() {
    try {
        // Step 1: Start Twilio room for interviewer
        console.log('[TEST] Step 1: Starting Twilio room for INTERVIEWER...');
        const startResponse1 = await axios.post(`${BASE_URL}/api/twilio/start`, {
            roomId: roomId,
            isInterviewer: true
        });
        
        if (!startResponse1.data.success) {
            throw new Error('Failed to start Twilio room for interviewer');
        }
        
        console.log('[TEST] ✓ Interviewer token received');
        console.log('[TEST]   - Room SID:', startResponse1.data.room.sid);
        console.log('[TEST]   - Room Name:', startResponse1.data.room.name);
        console.log('[TEST]   - Identity:', startResponse1.data.identity);
        console.log('');
        
        // Step 2: Get token for interviewee
        console.log('[TEST] Step 2: Getting token for INTERVIEWEE...');
        const startResponse2 = await axios.post(`${BASE_URL}/api/twilio/start`, {
            roomId: roomId,
            isInterviewer: false
        });
        
        if (!startResponse2.data.success) {
            throw new Error('Failed to get token for interviewee');
        }
        
        console.log('[TEST] ✓ Interviewee token received');
        console.log('[TEST]   - Identity:', startResponse2.data.identity);
        console.log('');
        
        // Step 3: Check room status
        console.log('[TEST] Step 3: Checking room status...');
        const statusResponse = await axios.get(`${BASE_URL}/api/twilio/status/${roomId}`);
        
        if (!statusResponse.data.success) {
            throw new Error('Failed to get room status');
        }
        
        console.log('[TEST] ✓ Room is active');
        console.log('[TEST]   - Room SID:', statusResponse.data.roomSid);
        console.log('[TEST]   - Duration:', statusResponse.data.duration, 'seconds');
        console.log('');
        
        // Step 4: Simulate some transcript entries
        console.log('[TEST] Step 4: Simulating transcript entries...');
        const transcriptEntries = [
            {
                speaker: 'Interviewer',
                text: 'Hello, thank you for joining today. Can you tell me about yourself?',
                timestamp: Date.now()
            },
            {
                speaker: 'Interviewee', 
                text: 'Hi, thanks for having me. I have 5 years of experience in software development.',
                timestamp: Date.now() + 1000
            },
            {
                speaker: 'Interviewer',
                text: 'That sounds great. What technologies are you most comfortable with?',
                timestamp: Date.now() + 2000
            },
            {
                speaker: 'Interviewee',
                text: 'I primarily work with JavaScript, React, Node.js, and Python.',
                timestamp: Date.now() + 3000
            }
        ];
        console.log('[TEST] ✓ Created', transcriptEntries.length, 'transcript entries');
        console.log('');
        
        // Step 5: Wait a bit to simulate recording time
        console.log('[TEST] Step 5: Simulating recording duration (10 seconds)...');
        await sleep(10000);
        console.log('[TEST] ✓ Recording simulation complete');
        console.log('');
        
        // Step 6: Stop recording
        console.log('[TEST] Step 6: Stopping Twilio recording...');
        const stopResponse = await axios.post(`${BASE_URL}/api/twilio/stop`, {
            roomId: roomId,
            transcriptEntries: transcriptEntries
        });
        
        console.log('[TEST] Stop response:', stopResponse.data);
        
        if (stopResponse.data.success) {
            console.log('[TEST] ✓ Recording stop initiated');
            console.log('[TEST]   - Message:', stopResponse.data.message);
            if (stopResponse.data.recordings && stopResponse.data.recordings.length > 0) {
                console.log('[TEST]   - Downloaded files:', stopResponse.data.recordings.length);
                stopResponse.data.recordings.forEach(rec => {
                    console.log('[TEST]     •', rec.filename);
                });
            } else {
                console.log('[TEST]   - No recordings downloaded yet (may still be processing)');
            }
        } else {
            console.log('[TEST] ⚠️ Stop returned success:false');
        }
        console.log('');
        
        // Step 7: Wait for recordings to be processed
        console.log('[TEST] Step 7: Waiting for recordings to be processed (30 seconds)...');
        await sleep(30000);
        
        // Step 8: Try manual download
        console.log('[TEST] Step 8: Attempting manual download of recordings...');
        try {
            const downloadResponse = await axios.post(`${BASE_URL}/api/twilio/download-recordings/${roomId}`);
            
            if (downloadResponse.data.success) {
                console.log('[TEST] ✓ Manual download successful');
                console.log('[TEST]   - Downloaded files:', downloadResponse.data.recordings.length);
                downloadResponse.data.recordings.forEach(rec => {
                    console.log('[TEST]     •', rec.filename, `(${rec.duration}s, ${rec.size} bytes)`);
                });
            } else {
                console.log('[TEST] ⚠️ Manual download failed:', downloadResponse.data.error);
            }
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log('[TEST] ⚠️ Room not found in memory (server may have restarted)');
            } else {
                console.log('[TEST] ⚠️ Manual download error:', error.message);
            }
        }
        console.log('');
        
        // Step 9: Check if files were created
        console.log('[TEST] Step 9: Checking file system...');
        const fs = require('fs');
        const path = require('path');
        const recordingDir = path.join(__dirname, 'recordings', roomId);
        
        if (fs.existsSync(recordingDir)) {
            console.log('[TEST] ✓ Recording directory exists:', recordingDir);
            
            const twilioDir = path.join(recordingDir, 'twilio');
            if (fs.existsSync(twilioDir)) {
                const files = fs.readdirSync(twilioDir);
                console.log('[TEST] ✓ Twilio directory contains', files.length, 'files:');
                files.forEach(file => {
                    const stats = fs.statSync(path.join(twilioDir, file));
                    console.log('[TEST]     •', file, `(${stats.size} bytes)`);
                });
            } else {
                console.log('[TEST] ⚠️ No twilio directory found');
            }
            
            const transcriptFile = path.join(recordingDir, 'realtime_transcript.json');
            if (fs.existsSync(transcriptFile)) {
                const transcript = JSON.parse(fs.readFileSync(transcriptFile, 'utf8'));
                console.log('[TEST] ✓ Transcript file found with', transcript.entries.length, 'entries');
            } else {
                console.log('[TEST] ⚠️ No transcript file found');
            }
        } else {
            console.log('[TEST] ⚠️ Recording directory does not exist');
        }
        
        console.log('');
        console.log('========================================');
        console.log('TEST COMPLETE');
        console.log('Room ID:', roomId);
        console.log('View transcript at: http://localhost:5002/transcript/' + roomId);
        console.log('========================================');
        
    } catch (error) {
        console.error('[TEST ERROR]', error.response ? error.response.data : error.message);
        if (error.response && error.response.data) {
            console.error('[TEST ERROR] Full response:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

// Run the test
testTwilioRecording();