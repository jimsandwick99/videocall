// Transcribe Twilio recordings using OpenAI Whisper
const fs = require('fs-extra');
const path = require('path');
const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function transcribeTwilioRecording(roomId) {
  console.log(`\n🎯 Transcribing Twilio recordings for room: ${roomId}\n`);
  
  // Find the Twilio recordings directory
  const twilioDir = path.join(__dirname, 'recordings', roomId, 'twilio');
  
  if (!await fs.pathExists(twilioDir)) {
    console.error(`❌ No Twilio recordings found at: ${twilioDir}`);
    return null;
  }
  
  // Get all audio files (Twilio uses .opus format)
  const files = await fs.readdir(twilioDir);
  const audioFiles = files.filter(f => 
    f.endsWith('.opus') || 
    f.endsWith('.mka') || 
    f.endsWith('.webm')
  );
  
  console.log(`📁 Found ${audioFiles.length} audio files to transcribe`);
  console.log('📁 Files found:', audioFiles);
  
  if (audioFiles.length === 0) {
    console.error('❌ No audio files found');
    return null;
  }
  
  const transcriptions = [];
  
  // Transcribe each audio file
  for (const audioFile of audioFiles) {
    const filePath = path.join(twilioDir, audioFile);
    const stats = await fs.stat(filePath);
    
    console.log(`\n📝 Transcribing: ${audioFile} (${Math.round(stats.size / 1024)}KB)`);
    
    try {
      // Convert MKA/Opus to MP3 format that OpenAI supports
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      const tempMp3Path = filePath
        .replace('.opus', '_temp.mp3')
        .replace('.mka', '_temp.mp3')
        .replace('.webm', '_temp.mp3');
      
      const ext = path.extname(filePath).substring(1).toUpperCase();
      console.log(`   Converting audio format for OpenAI (${ext} → MP3)...`);
      
      // Use ffmpeg to convert to MP3 (OpenAI's most reliable format)
      await execPromise(`ffmpeg -i "${filePath}" -acodec libmp3lame -ab 128k "${tempMp3Path}" -y`);
      
      // Check the converted file exists and has content
      const convertedStats = await fs.stat(tempMp3Path);
      console.log(`   Converted file size: ${Math.round(convertedStats.size / 1024)}KB`);
      
      // Read the converted file
      const audioBuffer = await fs.readFile(tempMp3Path);
      
      // Create a File object for OpenAI
      const mp3Filename = audioFile
        .replace('.mka', '.mp3')
        .replace('.opus', '.mp3')
        .replace('.webm', '.mp3');
      const file = new File([audioBuffer], mp3Filename, { 
        type: 'audio/mpeg' 
      });
      
      console.log('   Sending to OpenAI Whisper...');
      
      // Transcribe with Whisper
      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        response_format: 'verbose_json',
        language: 'en'
      });
      
      // Clean up temp file
      await fs.remove(tempMp3Path);
      
      console.log(`   ✅ Transcribed successfully`);
      console.log(`   Text preview: "${transcription.text.substring(0, 100)}..."`);
      
      // Determine speaker from filename - be more precise
      let speaker = 'Unknown';
      
      // Check if filename starts with interviewer_ or interviewee_
      if (audioFile.startsWith('interviewer_') || audioFile.includes('_interviewer_')) {
        speaker = 'Interviewer';
      } else if (audioFile.startsWith('interviewee_') || audioFile.includes('_interviewee_')) {
        speaker = 'Interviewee';
      } else if (audioFile.includes('interviewer')) {
        // Fallback: check if interviewer appears anywhere
        speaker = 'Interviewer';
      } else if (audioFile.includes('interviewee')) {
        // Fallback: check if interviewee appears anywhere
        speaker = 'Interviewee';
      } else {
        // Last resort: assume based on file order
        console.log(`   ⚠️ Could not determine speaker from filename: ${audioFile}`);
        speaker = audioFiles.indexOf(audioFile) === 0 ? 'Interviewer' : 'Interviewee';
      }
      
      console.log(`   Speaker identified as: ${speaker}`);
      
      transcriptions.push({
        file: audioFile,
        speaker: speaker,
        text: transcription.text,
        segments: transcription.segments,
        duration: transcription.duration,
        language: transcription.language
      });
      
    } catch (error) {
      console.error(`   ❌ Transcription failed: ${error.message}`);
      // Use same speaker detection logic for failed transcriptions
      let speaker = 'Unknown';
      if (audioFile.startsWith('interviewer_') || audioFile.includes('_interviewer_')) {
        speaker = 'Interviewer';
      } else if (audioFile.startsWith('interviewee_') || audioFile.includes('_interviewee_')) {
        speaker = 'Interviewee';
      } else if (audioFile.includes('interviewer')) {
        speaker = 'Interviewer';
      } else if (audioFile.includes('interviewee')) {
        speaker = 'Interviewee';
      } else {
        speaker = audioFiles.indexOf(audioFile) === 0 ? 'Interviewer' : 'Interviewee';
      }
      
      transcriptions.push({
        file: audioFile,
        speaker: speaker,
        text: '[Transcription failed]',
        error: error.message
      });
    }
  }
  
  // Merge transcriptions
  console.log('\n🔀 Merging transcriptions...');
  
  const merged = mergeTwilioTranscripts(transcriptions);
  
  // Save transcript
  const outputDir = path.join(__dirname, 'recordings', roomId);
  const transcriptPath = path.join(outputDir, 'twilio_transcript.json');
  const readablePath = path.join(outputDir, 'twilio_transcript.txt');
  
  await fs.writeJson(transcriptPath, {
    roomId,
    twilioRecordings: audioFiles.length,
    transcriptions,
    merged,
    timestamp: new Date().toISOString()
  }, { spaces: 2 });
  
  // Apply speaker diarization if we have merged segments
  if (merged && merged.length > 0) {
    console.log('\n🎯 Applying speaker diarization...');
    
    try {
      const { execSync } = require('child_process');
      
      // Check if we have Python and required libraries
      try {
        execSync('python3 --version', { stdio: 'ignore' });
        
        // Run speaker diarization (use simple version that doesn't require libraries)
        const diarizationScript = path.join(__dirname, 'speaker-diarization-simple.py');
        
        // Find the first audio file to use for diarization (if available)
        const audioFilePath = audioFiles.length > 0 
          ? path.join(twilioDir, audioFiles[0]) 
          : null;
        
        const command = audioFilePath 
          ? `python3 "${diarizationScript}" "${transcriptPath}" "${audioFilePath}"`
          : `python3 "${diarizationScript}" "${transcriptPath}"`;
        
        console.log('   Running diarization script...');
        execSync(command, { stdio: 'inherit' });
        
        // Load the diarized transcript
        const diarizedPath = transcriptPath.replace('.json', '_diarized.json');
        if (await fs.pathExists(diarizedPath)) {
          const diarizedData = await fs.readJson(diarizedPath);
          
          // Update the merged segments with diarized data
          merged = diarizedData.merged || merged;
          transcriptions = diarizedData.transcriptions || transcriptions;
          
          // Save updated transcript
          await fs.writeJson(transcriptPath, {
            roomId,
            twilioRecordings: audioFiles.length,
            transcriptions,
            merged,
            diarization_applied: true,
            diarization_method: diarizedData.diarization_method || 'simple',
            timestamp: new Date().toISOString()
          }, { spaces: 2 });
          
          console.log('   ✅ Speaker diarization applied successfully');
          
          // Remove the temporary diarized file
          await fs.remove(diarizedPath);
        }
        
      } catch (pythonError) {
        console.log('   ⚠️ Python not available, using basic speaker assignment');
        
        // Simple fallback: Alternate speakers based on timing
        let currentSpeaker = 'Interviewer';
        for (let i = 0; i < merged.length; i++) {
          // First segment is usually the interviewer
          if (i === 0) {
            merged[i].speaker = 'Interviewer';
          } else {
            // Check for significant time gap to detect speaker change
            const gap = merged[i].start - merged[i-1].end;
            if (gap > 0.5) {
              // Switch speaker on significant pause
              currentSpeaker = currentSpeaker === 'Interviewer' ? 'Interviewee' : 'Interviewer';
            }
            merged[i].speaker = currentSpeaker;
          }
        }
        
        // Save with basic diarization
        await fs.writeJson(transcriptPath, {
          roomId,
          twilioRecordings: audioFiles.length,
          transcriptions,
          merged,
          diarization_applied: true,
          diarization_method: 'simple-fallback',
          timestamp: new Date().toISOString()
        }, { spaces: 2 });
      }
      
    } catch (error) {
      console.error('   ⚠️ Speaker diarization failed:', error.message);
      // Continue with original transcript
    }
  }
  
  // Generate readable transcript
  const readableTranscript = generateReadableTranscript(merged, transcriptions);
  await fs.writeFile(readablePath, readableTranscript);
  
  console.log('\n✅ Transcription complete!');
  console.log(`📄 JSON transcript: ${transcriptPath}`);
  console.log(`📄 Text transcript: ${readablePath}`);
  
  return { transcriptPath, readablePath, transcriptions };
}

function mergeTwilioTranscripts(transcriptions) {
  const allSegments = [];
  
  console.log('\n🔀 Processing transcriptions from speakers:');
  transcriptions.forEach(trans => {
    console.log(`  - ${trans.speaker}: ${trans.file} (${trans.segments?.length || 0} segments)`);
  });
  
  // Since Twilio records separate tracks, we need to merge them
  // Each transcription is from a different speaker
  for (const trans of transcriptions) {
    if (trans.segments && trans.segments.length > 0) {
      trans.segments.forEach(segment => {
        allSegments.push({
          ...segment,
          speaker: trans.speaker,
          file: trans.file
        });
      });
    }
  }
  
  // Sort by start time to create a chronological conversation
  allSegments.sort((a, b) => a.start - b.start);
  
  console.log(`🔀 Merged ${allSegments.length} total segments from ${transcriptions.length} speakers`);
  
  return allSegments;
}

function generateReadableTranscript(merged, transcriptions) {
  let output = `Twilio Recording Transcript\n`;
  output += `Generated: ${new Date().toLocaleString()}\n`;
  output += `${'='.repeat(60)}\n\n`;
  
  // If we have segments with timestamps
  if (merged && merged.length > 0) {
    output += `CONVERSATION WITH TIMESTAMPS:\n`;
    output += `${'='.repeat(60)}\n\n`;
    
    for (const segment of merged) {
      const timestamp = formatTime(segment.start);
      output += `[${timestamp}] ${segment.speaker}:\n`;
      output += `${segment.text}\n\n`;
    }
  } else {
    // Fallback: Just show full transcriptions by speaker
    output += `FULL TRANSCRIPTIONS BY SPEAKER:\n`;
    output += `${'='.repeat(60)}\n\n`;
    
    for (const trans of transcriptions) {
      output += `${trans.speaker.toUpperCase()}:\n`;
      output += `${'='.repeat(40)}\n`;
      output += trans.text || '[No transcription available]';
      output += `\n\n`;
    }
  }
  
  return output;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// If run directly, transcribe the most recent recording
if (require.main === module) {
  const roomId = process.argv[2];
  
  if (!roomId) {
    console.log('Usage: node transcribe-twilio.js <roomId>');
    console.log('\nFinding recent recordings...');
    
    // Find most recent recording
    const recordingsDir = path.join(__dirname, 'recordings');
    fs.readdir(recordingsDir).then(async dirs => {
      // Filter for directories with Twilio recordings
      const validDirs = [];
      for (const dir of dirs) {
        const twilioDir = path.join(recordingsDir, dir, 'twilio');
        if (await fs.pathExists(twilioDir)) {
          const files = await fs.readdir(twilioDir);
          if (files.some(f => f.endsWith('.opus') || f.endsWith('.mka'))) {
            validDirs.push(dir);
          }
        }
      }
      
      if (validDirs.length > 0) {
        console.log('\nRecordings with Twilio audio:');
        validDirs.forEach(dir => console.log(`  - ${dir}`));
        console.log('\nRun: node transcribe-twilio.js <roomId>');
      } else {
        console.log('No Twilio recordings found');
      }
    });
  } else {
    transcribeTwilioRecording(roomId).catch(console.error);
  }
}

module.exports = transcribeTwilioRecording;