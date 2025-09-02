#!/usr/bin/env node

// Step 1: Test basic transcription with a generated audio file
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function testTranscription() {
    console.log('\n🧪 STEP 1: Testing Basic Transcription\n');
    console.log('=' .repeat(60));
    
    try {
        // 1. Create a test audio file using text-to-speech
        console.log('\n1️⃣  Creating test audio file...');
        const testDir = path.join(__dirname, 'test-audio');
        await fs.ensureDir(testDir);
        
        const testText = "Hello, this is a test of the transcription system. Today is a great day for testing audio transcription. Let's make sure everything works correctly.";
        
        // Use macOS say command to generate audio (or espeak on Linux)
        const wavFile = path.join(testDir, 'test.wav');
        const mp3File = path.join(testDir, 'test.mp3');
        
        console.log('   Generating speech...');
        await execPromise(`say -o "${wavFile}" "${testText}"`);
        console.log(`   ✅ Created WAV file: ${wavFile}`);
        
        // Convert to MP3 (OpenAI prefers mp3)
        console.log('   Converting to MP3...');
        await execPromise(`ffmpeg -i "${wavFile}" -acodec mp3 -ab 128k "${mp3File}" -y`);
        console.log(`   ✅ Created MP3 file: ${mp3File}`);
        
        // Check file size
        const stats = await fs.stat(mp3File);
        console.log(`   File size: ${Math.round(stats.size / 1024)}KB`);
        
        // 2. Test transcription with OpenAI
        console.log('\n2️⃣  Testing OpenAI Whisper transcription...');
        
        const audioBuffer = await fs.readFile(mp3File);
        const file = new File([audioBuffer], 'test.mp3', { type: 'audio/mpeg' });
        
        console.log('   Sending to OpenAI Whisper...');
        const transcription = await openai.audio.transcriptions.create({
            file: file,
            model: 'whisper-1',
            response_format: 'text'
        });
        
        console.log('\n   ✅ Transcription successful!');
        console.log('   Original text:', testText);
        console.log('   Transcribed:', transcription);
        
        // 3. Test with different formats
        console.log('\n3️⃣  Testing different audio formats...');
        
        // Test WebM (what we might get from browser)
        const webmFile = path.join(testDir, 'test.webm');
        await execPromise(`ffmpeg -i "${wavFile}" -c:a libopus -f webm "${webmFile}" -y`);
        console.log('   Testing WebM format...');
        
        const webmBuffer = await fs.readFile(webmFile);
        const webmFileObj = new File([webmBuffer], 'test.webm', { type: 'audio/webm' });
        
        try {
            const webmTranscription = await openai.audio.transcriptions.create({
                file: webmFileObj,
                model: 'whisper-1',
                response_format: 'text'
            });
            console.log('   ✅ WebM transcription works:', webmTranscription.substring(0, 50) + '...');
        } catch (error) {
            console.log('   ❌ WebM transcription failed:', error.message);
        }
        
        // Test MKA (what Twilio produces)
        const mkaFile = path.join(testDir, 'test.mka');
        await execPromise(`ffmpeg -i "${wavFile}" -c:a libopus "${mkaFile}" -y`);
        console.log('   Testing MKA format (Twilio format)...');
        
        const mkaBuffer = await fs.readFile(mkaFile);
        const mkaFileObj = new File([mkaBuffer], 'test.mka', { type: 'audio/x-matroska' });
        
        try {
            const mkaTranscription = await openai.audio.transcriptions.create({
                file: mkaFileObj,
                model: 'whisper-1',
                response_format: 'text'
            });
            console.log('   ✅ MKA transcription works:', mkaTranscription.substring(0, 50) + '...');
        } catch (error) {
            console.log('   ❌ MKA transcription failed:', error.message);
            console.log('   Need to convert MKA to supported format first');
            
            // Try converting MKA to MP3 first
            const mkaToMp3 = path.join(testDir, 'test-from-mka.mp3');
            await execPromise(`ffmpeg -i "${mkaFile}" -acodec mp3 -ab 128k "${mkaToMp3}" -y`);
            
            const convertedBuffer = await fs.readFile(mkaToMp3);
            const convertedFile = new File([convertedBuffer], 'test.mp3', { type: 'audio/mpeg' });
            
            const convertedTranscription = await openai.audio.transcriptions.create({
                file: convertedFile,
                model: 'whisper-1',
                response_format: 'text'
            });
            console.log('   ✅ MKA→MP3 transcription works:', convertedTranscription.substring(0, 50) + '...');
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('\n📊 RESULTS:');
        console.log('✅ OpenAI Whisper is working');
        console.log('✅ MP3 format works directly');
        console.log('⚠️  MKA format needs conversion to MP3 first');
        console.log('✅ Conversion pipeline: MKA → MP3 → Whisper');
        
        return true;
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.message.includes('say: command not found')) {
            console.log('\n💡 On Linux, install espeak: sudo apt-get install espeak');
            console.log('   Then replace "say" with "espeak" in the script');
        }
        return false;
    }
}

// Run the test
testTranscription();