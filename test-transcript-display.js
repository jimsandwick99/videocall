const axios = require('axios');

const BASE_URL = 'http://localhost:5002';

async function testTranscriptDisplay() {
    console.log('Testing transcript display functionality...\n');
    
    try {
        // 1. Get list of recordings
        console.log('1. Fetching recordings list...');
        const recordingsResponse = await axios.get(`${BASE_URL}/api/recordings`);
        const recordings = recordingsResponse.data.recordings;
        
        if (recordings.length === 0) {
            console.log('No recordings found. Please complete a video call with recording first.');
            return;
        }
        
        console.log(`Found ${recordings.length} recording(s)`);
        
        // 2. Check each recording for transcripts
        for (const recording of recordings) {
            console.log(`\n📹 Room: ${recording.roomId.substring(0, 8)}...`);
            console.log(`   Date: ${new Date(recording.date).toLocaleString()}`);
            console.log(`   Has Transcript: ${recording.hasTranscript ? '✅' : '❌'}`);
            
            if (recording.hasTranscript) {
                console.log(`   Transcript Type: ${recording.transcriptType}`);
                console.log(`   Entry Count: ${recording.transcriptEntryCount || 'N/A'}`);
                console.log(`   Viewer URL: ${BASE_URL}/transcript/${recording.roomId}`);
                
                // Try to fetch transcript data
                try {
                    // Try real-time first
                    let transcriptResponse = await axios.get(`${BASE_URL}/api/transcript/${recording.roomId}?format=realtime`);
                    let transcriptData = transcriptResponse.data;
                    
                    if (transcriptData.entries && transcriptData.entries.length > 0) {
                        console.log(`\n   📝 Real-time Transcript Preview (first 2 entries):`);
                        transcriptData.entries.slice(0, 2).forEach((entry, i) => {
                            console.log(`      ${i+1}. ${entry.speaker}: "${entry.text.substring(0, 100)}${entry.text.length > 100 ? '...' : ''}"`);
                        });
                    }
                } catch (rtError) {
                    // Try whisper transcript
                    try {
                        let transcriptResponse = await axios.get(`${BASE_URL}/api/transcript/${recording.roomId}?format=json`);
                        let transcriptData = transcriptResponse.data;
                        
                        if (transcriptData.merged && transcriptData.merged.length > 0) {
                            console.log(`\n   🤖 AI Transcript Preview (first 2 entries):`);
                            transcriptData.merged.slice(0, 2).forEach((segment, i) => {
                                console.log(`      ${i+1}. ${segment.speaker}: "${segment.text.substring(0, 100)}${segment.text.length > 100 ? '...' : ''}"`);
                            });
                        }
                    } catch (whisperError) {
                        console.log('   ⚠️ Could not fetch transcript data');
                    }
                }
            }
        }
        
        console.log('\n✅ Transcript display test complete!');
        console.log(`\n🌐 Open ${BASE_URL} in your browser to see the updated interface with transcript previews.`);
        
    } catch (error) {
        console.error('Error during test:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

// Run the test
testTranscriptDisplay();