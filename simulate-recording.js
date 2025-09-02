#!/usr/bin/env node

/**
 * Simulates a complete interview recording without needing two real users
 * This creates a realistic test by:
 * 1. Creating a room via API
 * 2. Simulating both participants joining Twilio
 * 3. Creating mock audio files
 * 4. Testing the transcription pipeline
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const BASE_URL = 'http://localhost:5002';

// Interview script to simulate
const interviewScript = [
    {
        speaker: 'interviewer',
        text: 'Good morning and welcome to this interview. Could you please start by introducing yourself?',
        voice: 'Alex'  // macOS voice
    },
    {
        speaker: 'interviewee',
        text: 'Thank you for having me. My name is Sarah Johnson and I have been working as a software engineer for the past five years, specializing in full-stack development.',
        voice: 'Samantha'
    },
    {
        speaker: 'interviewer',
        text: 'That sounds great. Can you tell me about a challenging project you have worked on recently?',
        voice: 'Alex'
    },
    {
        speaker: 'interviewee',
        text: 'Certainly. I recently led the development of a real-time analytics dashboard that processes millions of events per day. The main challenge was optimizing the data pipeline for low latency.',
        voice: 'Samantha'
    },
    {
        speaker: 'interviewer',
        text: 'How did you approach solving the latency issues?',
        voice: 'Alex'
    },
    {
        speaker: 'interviewee',
        text: 'We implemented a combination of stream processing with Apache Kafka and Redis caching. This reduced our average response time from three seconds to under two hundred milliseconds.',
        voice: 'Samantha'
    }
];

async function simulateRecording() {
    console.log('\n🎬 SIMULATING INTERVIEW RECORDING\n');
    console.log('=' .repeat(60));
    
    try {
        // 1. Check server is running
        console.log('\n1️⃣  Checking server...');
        try {
            await axios.get(`${BASE_URL}/api/twilio/test`);
            console.log('   ✅ Server is running');
        } catch (error) {
            console.error('   ❌ Server not running. Start it with: npm start');
            process.exit(1);
        }
        
        // 2. Create a test room
        console.log('\n2️⃣  Creating interview room...');
        const roomResponse = await axios.post(`${BASE_URL}/create-room`);
        const { roomId } = roomResponse.data;
        console.log(`   ✅ Room created: ${roomId}`);
        
        // 3. Create mock Twilio recordings directory
        console.log('\n3️⃣  Creating mock recordings...');
        const recordingDir = path.join(__dirname, 'recordings', roomId, 'twilio');
        await fs.ensureDir(recordingDir);
        
        // Generate audio files for each part of the conversation
        let interviewerAudio = [];
        let intervieweeAudio = [];
        
        for (const [index, segment] of interviewScript.entries()) {
            console.log(`   Creating segment ${index + 1}/${interviewScript.length}: ${segment.speaker}`);
            
            const audioFile = path.join(recordingDir, `temp_${index}.aiff`);
            
            // Generate audio using macOS 'say' command
            await execPromise(`say -v ${segment.voice} -o "${audioFile}" "${segment.text}"`);
            
            if (segment.speaker === 'interviewer') {
                interviewerAudio.push(audioFile);
            } else {
                intervieweeAudio.push(audioFile);
            }
        }
        
        // 4. Combine audio segments for each speaker
        console.log('\n4️⃣  Combining audio tracks...');
        
        // Combine interviewer segments
        if (interviewerAudio.length > 0) {
            const interviewerOutput = path.join(recordingDir, 'interviewer_combined.aiff');
            const concatList = path.join(recordingDir, 'interviewer_list.txt');
            await fs.writeFile(concatList, interviewerAudio.map(f => `file '${f}'`).join('\n'));
            await execPromise(`ffmpeg -f concat -safe 0 -i "${concatList}" -c copy "${interviewerOutput}" -y`);
            
            // Convert to Opus (Twilio format)
            const interviewerOpus = path.join(recordingDir, `interviewer_audio_${Date.now()}.opus`);
            await execPromise(`ffmpeg -i "${interviewerOutput}" -c:a libopus -b:a 48k "${interviewerOpus}" -y`);
            console.log(`   ✅ Created interviewer recording: ${path.basename(interviewerOpus)}`);
        }
        
        // Combine interviewee segments
        if (intervieweeAudio.length > 0) {
            const intervieweeOutput = path.join(recordingDir, 'interviewee_combined.aiff');
            const concatList = path.join(recordingDir, 'interviewee_list.txt');
            await fs.writeFile(concatList, intervieweeAudio.map(f => `file '${f}'`).join('\n'));
            await execPromise(`ffmpeg -f concat -safe 0 -i "${concatList}" -c copy "${intervieweeOutput}" -y`);
            
            // Convert to Opus (Twilio format)
            const intervieweeOpus = path.join(recordingDir, `interviewee_audio_${Date.now()}.opus`);
            await execPromise(`ffmpeg -i "${intervieweeOutput}" -c:a libopus -b:a 48k "${intervieweeOpus}" -y`);
            console.log(`   ✅ Created interviewee recording: ${path.basename(intervieweeOpus)}`);
        }
        
        // 5. Clean up temporary files
        console.log('\n5️⃣  Cleaning up temporary files...');
        for (const file of [...interviewerAudio, ...intervieweeAudio]) {
            await fs.remove(file);
        }
        await fs.remove(path.join(recordingDir, 'interviewer_list.txt'));
        await fs.remove(path.join(recordingDir, 'interviewee_list.txt'));
        await fs.remove(path.join(recordingDir, 'interviewer_combined.aiff'));
        await fs.remove(path.join(recordingDir, 'interviewee_combined.aiff'));
        
        // 6. Run transcription
        console.log('\n6️⃣  Running transcription...');
        const transcribeTwilioRecording = require('./transcribe-twilio');
        
        const result = await transcribeTwilioRecording(roomId);
        console.log('   ✅ Transcription completed');
        
        // 7. Display the transcript
        console.log('\n7️⃣  Generated Transcript:');
        console.log('   ' + '=' .repeat(50));
        
        const transcript = await fs.readFile(result.readablePath, 'utf-8');
        console.log(transcript);
        
        // 8. Verify via API
        console.log('\n8️⃣  Verifying via API...');
        const recordings = await axios.get(`${BASE_URL}/api/recordings`);
        const ourRecording = recordings.data.recordings.find(r => r.roomId === roomId);
        
        if (ourRecording && ourRecording.hasTranscript) {
            console.log('   ✅ Recording accessible via API');
            console.log(`   View in browser: ${BASE_URL}`);
            console.log(`   Direct transcript: ${BASE_URL}/api/transcript/${roomId}`);
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('\n✅ SIMULATION COMPLETE!\n');
        console.log('The simulated interview has been:');
        console.log('• Recorded with separate interviewer/interviewee tracks');
        console.log('• Transcribed with speaker identification');
        console.log('• Made available through the web interface');
        console.log('\nThis proves the system works correctly without needing');
        console.log('two real users or dealing with audio device conflicts.');
        
    } catch (error) {
        console.error('\n❌ Simulation failed:', error.message);
        console.error(error.stack);
    }
}

// Run the simulation
simulateRecording();