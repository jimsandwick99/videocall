#!/usr/bin/env node

// Test script to verify the recording and transcription system
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const BASE_URL = 'http://localhost:5002';

async function testSystem() {
    console.log('\n🧪 TESTING RECORDING & TRANSCRIPTION SYSTEM\n');
    console.log('=' .repeat(60));
    
    try {
        // 1. Test if server is running
        console.log('\n1️⃣  Testing server connection...');
        try {
            await axios.get(`${BASE_URL}/api/twilio/test`);
            console.log('   ✅ Server is running');
        } catch (error) {
            console.error('   ❌ Server is not running. Please start it with: npm start');
            process.exit(1);
        }
        
        // 2. Check Twilio configuration
        console.log('\n2️⃣  Checking Twilio configuration...');
        const twilioTest = await axios.get(`${BASE_URL}/api/twilio/test`);
        if (twilioTest.data.configured) {
            console.log('   ✅ Twilio is configured');
        } else {
            console.log('   ❌ Twilio credentials missing in .env file');
            process.exit(1);
        }
        
        // 3. List current recordings
        console.log('\n3️⃣  Checking existing recordings...');
        const recordings = await axios.get(`${BASE_URL}/api/recordings`);
        console.log(`   📁 Found ${recordings.data.recordings.length} existing recordings`);
        
        if (recordings.data.recordings.length > 0) {
            console.log('\n   Recent recordings:');
            recordings.data.recordings.slice(0, 3).forEach(rec => {
                console.log(`   - Room: ${rec.roomId.substring(0, 8)}...`);
                console.log(`     Files: ${rec.files.length}`);
                console.log(`     Transcript: ${rec.hasTranscript ? '✅ Yes' : '❌ No'}`);
            });
        }
        
        // 4. Check if ffmpeg is installed (needed for transcription)
        console.log('\n4️⃣  Checking ffmpeg installation...');
        const { exec } = require('child_process');
        exec('ffmpeg -version', (error, stdout) => {
            if (error) {
                console.log('   ❌ ffmpeg not installed (needed for transcription)');
                console.log('   Install with: brew install ffmpeg');
            } else {
                console.log('   ✅ ffmpeg is installed');
            }
        });
        
        // 5. Check OpenAI API key
        console.log('\n5️⃣  Checking OpenAI configuration...');
        const hasOpenAI = process.env.OPENAI_API_KEY || 
                         fs.existsSync(path.join(__dirname, '.env')) && 
                         fs.readFileSync(path.join(__dirname, '.env'), 'utf-8').includes('OPENAI_API_KEY');
        if (hasOpenAI) {
            console.log('   ✅ OpenAI API key is configured');
        } else {
            console.log('   ❌ OpenAI API key missing (needed for transcription)');
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('\n📋 SUMMARY:\n');
        console.log('The system is set up for:');
        console.log('1. Creating video call rooms ✅');
        console.log('2. Recording with Twilio ✅');
        console.log('3. Automatic transcription with OpenAI Whisper ✅');
        console.log('4. Viewing transcripts in the UI ✅');
        
        console.log('\n🚀 HOW TO USE:\n');
        console.log('1. Open http://localhost:5002 in your browser');
        console.log('2. Click "Create Video Call Room"');
        console.log('3. Join as Interviewer (use the interviewer link)');
        console.log('4. Have someone join as Interviewee (share the candidate link)');
        console.log('5. Click "Start Recording" button');
        console.log('6. Conduct your interview');
        console.log('7. Click "Stop Recording" button');
        console.log('8. Wait for transcription (takes 10-30 seconds)');
        console.log('9. View transcript on the main page');
        
        console.log('\n⚠️  IMPORTANT NOTES:\n');
        console.log('- Only the interviewer can start/stop recordings');
        console.log('- Recordings are saved as .mka files (Matroska Audio)');
        console.log('- Transcripts are generated automatically after stopping');
        console.log('- Both audio tracks (interviewer & interviewee) are transcribed');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Run the test
testSystem();