#!/usr/bin/env node

/**
 * Generates real audio files with speech for testing transcription
 */

const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Interview conversation script
const conversation = [
  { speaker: 'interviewer', text: 'Hello and welcome to this interview. Could you please introduce yourself?', voice: 'Alex' },
  { speaker: 'interviewee', text: 'Hi, thank you for having me. My name is Sam and I have five years of experience in software development.', voice: 'Samantha' },
  { speaker: 'interviewer', text: 'That sounds great. Can you tell me about a challenging project you worked on?', voice: 'Alex' },
  { speaker: 'interviewee', text: 'Certainly. I recently led a team to build a real-time data processing system that handles millions of events per day.', voice: 'Samantha' },
  { speaker: 'interviewer', text: 'Impressive. What technologies did you use for that project?', voice: 'Alex' },
  { speaker: 'interviewee', text: 'We used Apache Kafka for event streaming, Python for data processing, and PostgreSQL for storage.', voice: 'Samantha' }
];

async function generateAudioFile(text, voice, outputFile) {
  console.log(`🎤 Generating audio: "${text.substring(0, 50)}..."`);
  
  // First generate AIFF file using macOS say command
  const aiffFile = outputFile.replace('.webm', '.aiff');
  const sayCommand = `say -v ${voice} -o "${aiffFile}" "${text}"`;
  
  try {
    await execPromise(sayCommand);
    console.log(`✅ Generated AIFF: ${path.basename(aiffFile)}`);
    
    // Convert AIFF to WAV using ffmpeg (if available) or use AIFF directly
    // For now, we'll use the AIFF file and convert it to a simple audio format
    // Since we need WebM, let's try using ffmpeg if available
    try {
      const wavFile = outputFile.replace('.webm', '.wav');
      await execPromise(`ffmpeg -i "${aiffFile}" -acodec pcm_s16le -ar 16000 "${wavFile}" -y 2>/dev/null`);
      
      // Convert WAV to WebM
      await execPromise(`ffmpeg -i "${wavFile}" -c:a libopus -b:a 96k "${outputFile}" -y 2>/dev/null`);
      
      // Clean up intermediate files
      await fs.remove(aiffFile);
      await fs.remove(wavFile);
      
      console.log(`✅ Converted to WebM: ${path.basename(outputFile)}`);
    } catch (ffmpegError) {
      console.log(`⚠️  ffmpeg not available, using raw audio file`);
      // If ffmpeg is not available, create a fake WebM with the AIFF data
      const audioData = await fs.readFile(aiffFile);
      await fs.writeFile(outputFile, audioData);
      await fs.remove(aiffFile);
    }
    
    return outputFile;
  } catch (error) {
    console.error(`❌ Error generating audio: ${error.message}`);
    throw error;
  }
}

async function splitConversationIntoChunks() {
  console.log('🎭 Generating conversation audio files...\n');
  
  const outputDir = path.join(__dirname, 'test-audio');
  await fs.ensureDir(outputDir);
  
  // Group conversation by chunks (2 exchanges per chunk)
  const chunks = [];
  for (let i = 0; i < conversation.length; i += 2) {
    chunks.push(conversation.slice(i, Math.min(i + 2, conversation.length)));
  }
  
  console.log(`📦 Creating ${chunks.length} chunks of audio...\n`);
  
  const audioFiles = {
    local: [],
    remote: []
  };
  
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    
    // Separate interviewer and interviewee audio
    const interviewerTexts = chunk.filter(c => c.speaker === 'interviewer').map(c => c.text);
    const intervieweeTexts = chunk.filter(c => c.speaker === 'interviewee').map(c => c.text);
    
    // Generate interviewer audio (local)
    if (interviewerTexts.length > 0) {
      const localFile = path.join(outputDir, `local_chunk_${chunkIndex}.webm`);
      const text = interviewerTexts.join(' ... '); // Add pause between sentences
      await generateAudioFile(text, 'Alex', localFile);
      audioFiles.local.push(localFile);
    }
    
    // Generate interviewee audio (remote)
    if (intervieweeTexts.length > 0) {
      const remoteFile = path.join(outputDir, `remote_chunk_${chunkIndex}.webm`);
      const text = intervieweeTexts.join(' ... '); // Add pause between sentences
      await generateAudioFile(text, 'Samantha', remoteFile);
      audioFiles.remote.push(remoteFile);
    }
  }
  
  console.log('\n✅ Audio files generated successfully!');
  console.log(`📁 Files saved in: ${outputDir}`);
  console.log('\nGenerated files:');
  console.log('Local (Interviewer):', audioFiles.local.map(f => path.basename(f)));
  console.log('Remote (Interviewee):', audioFiles.remote.map(f => path.basename(f)));
  
  return audioFiles;
}

// Check if ffmpeg is available
async function checkFFmpeg() {
  try {
    await execPromise('which ffmpeg');
    console.log('✅ ffmpeg is available\n');
    return true;
  } catch {
    console.log('⚠️  ffmpeg not found. Install it for better audio conversion:');
    console.log('   brew install ffmpeg\n');
    return false;
  }
}

async function main() {
  console.log('=' .repeat(60));
  console.log('🎬 AUDIO FILE GENERATOR FOR TESTING');
  console.log('=' .repeat(60) + '\n');
  
  await checkFFmpeg();
  
  try {
    const files = await splitConversationIntoChunks();
    
    console.log('\n' + '=' .repeat(60));
    console.log('✅ Ready for testing with real audio!');
    console.log('Run: node simulate-interview-with-audio.js');
    console.log('=' .repeat(60));
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();