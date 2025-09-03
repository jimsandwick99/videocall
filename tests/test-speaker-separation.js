#!/usr/bin/env node

// Test script to verify speaker separation in recordings
const fs = require('fs-extra');
const path = require('path');

async function testSpeakerSeparation() {
  console.log('\n====== TESTING SPEAKER SEPARATION ======\n');
  
  const recordingsDir = path.join(__dirname, 'recordings');
  
  try {
    // Check if recordings directory exists
    if (!await fs.pathExists(recordingsDir)) {
      console.log('❌ No recordings directory found');
      return;
    }
    
    // Get all room directories
    const roomDirs = await fs.readdir(recordingsDir);
    const validRooms = [];
    
    for (const roomId of roomDirs) {
      if (roomId === 'temp') continue;
      
      const twilioDir = path.join(recordingsDir, roomId, 'twilio');
      if (await fs.pathExists(twilioDir)) {
        validRooms.push(roomId);
      }
    }
    
    if (validRooms.length === 0) {
      console.log('❌ No recordings found');
      return;
    }
    
    console.log(`Found ${validRooms.length} recording(s)\n`);
    
    // Analyze each recording
    for (const roomId of validRooms) {
      console.log(`\n📁 Room: ${roomId}`);
      console.log('=' .repeat(50));
      
      const twilioDir = path.join(recordingsDir, roomId, 'twilio');
      const files = await fs.readdir(twilioDir);
      
      // Filter audio files
      const audioFiles = files.filter(f => 
        f.endsWith('.opus') || f.endsWith('.mka') || f.endsWith('.webm') || f.endsWith('.mp4')
      );
      
      console.log(`\n📼 Audio Files (${audioFiles.length}):`);
      
      // Analyze each audio file
      const interviewerFiles = [];
      const intervieweeFiles = [];
      const unknownFiles = [];
      
      for (const file of audioFiles) {
        const filePath = path.join(twilioDir, file);
        const stats = await fs.stat(filePath);
        const sizeKB = Math.round(stats.size / 1024);
        
        // Detect speaker from filename
        if (file.includes('interviewer')) {
          interviewerFiles.push({ file, size: sizeKB });
        } else if (file.includes('interviewee')) {
          intervieweeFiles.push({ file, size: sizeKB });
        } else {
          unknownFiles.push({ file, size: sizeKB });
        }
        
        console.log(`  • ${file} (${sizeKB} KB)`);
      }
      
      // Speaker analysis
      console.log('\n🎤 Speaker Analysis:');
      console.log(`  Interviewer files: ${interviewerFiles.length}`);
      for (const f of interviewerFiles) {
        console.log(`    - ${f.file} (${f.size} KB)`);
      }
      
      console.log(`  Interviewee files: ${intervieweeFiles.length}`);
      for (const f of intervieweeFiles) {
        console.log(`    - ${f.file} (${f.size} KB)`);
      }
      
      if (unknownFiles.length > 0) {
        console.log(`  ⚠️  Unknown speaker files: ${unknownFiles.length}`);
        for (const f of unknownFiles) {
          console.log(`    - ${f.file} (${f.size} KB)`);
        }
      }
      
      // Check transcript
      const transcriptJsonPath = path.join(recordingsDir, roomId, 'twilio_transcript.json');
      const transcriptTxtPath = path.join(recordingsDir, roomId, 'twilio_transcript.txt');
      
      console.log('\n📝 Transcript Status:');
      if (await fs.pathExists(transcriptJsonPath)) {
        const transcript = await fs.readJson(transcriptJsonPath);
        console.log(`  ✅ JSON transcript exists`);
        console.log(`     - Total recordings: ${transcript.twilioRecordings || 0}`);
        console.log(`     - Transcriptions: ${transcript.transcriptions?.length || 0}`);
        
        if (transcript.transcriptions) {
          const speakers = {};
          transcript.transcriptions.forEach(t => {
            speakers[t.speaker] = (speakers[t.speaker] || 0) + 1;
          });
          console.log(`     - Speakers found:`, speakers);
        }
        
        if (transcript.merged) {
          const speakerSegments = {};
          transcript.merged.forEach(seg => {
            speakerSegments[seg.speaker] = (speakerSegments[seg.speaker] || 0) + 1;
          });
          console.log(`     - Merged segments by speaker:`, speakerSegments);
        }
        
        if (transcript.diarization_applied) {
          console.log(`     - Diarization: ${transcript.diarization_method || 'unknown'}`);
        }
      } else {
        console.log(`  ❌ No transcript found`);
      }
      
      // Diagnosis
      console.log('\n🔍 Diagnosis:');
      if (interviewerFiles.length === 0 && intervieweeFiles.length === 0) {
        console.log('  ❌ PROBLEM: No files with speaker identification');
        console.log('  💡 Files are not being labeled with speaker identities');
      } else if (interviewerFiles.length > 0 && intervieweeFiles.length > 0) {
        console.log('  ✅ SUCCESS: Both speakers have separate recordings');
      } else if (interviewerFiles.length > 0 || intervieweeFiles.length > 0) {
        console.log('  ⚠️  WARNING: Only one speaker found in recordings');
        console.log('  💡 Possible cause: Only one participant joined Twilio room');
      }
      
      if (unknownFiles.length > 0) {
        console.log('  ⚠️  Some files lack speaker identification');
        console.log('  💡 These files will be assigned speakers based on order');
      }
    }
    
  } catch (error) {
    console.error('❌ Error during test:', error.message);
  }
  
  console.log('\n====== TEST COMPLETE ======\n');
}

// Run the test
testSpeakerSeparation();