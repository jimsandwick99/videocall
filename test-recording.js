// Test script to verify recording functionality
const fs = require('fs-extra');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

const SERVER_URL = 'http://localhost:5002';
const TEST_ROOM_ID = 'test-room-' + Date.now();

async function createTestAudioFile() {
    // Create a dummy webm file for testing
    const buffer = Buffer.from('WEBM_TEST_DATA_' + Date.now());
    const filename = 'test_audio.webm';
    await fs.writeFile(filename, buffer);
    return filename;
}

async function testChunkUpload(chunkIndex, streamType) {
    console.log(`\n📤 Testing upload of ${streamType} chunk ${chunkIndex}...`);
    
    const audioFile = await createTestAudioFile();
    const form = new FormData();
    
    form.append('audio', fs.createReadStream(audioFile), {
        filename: `${streamType}_test.webm`,
        contentType: 'audio/webm'
    });
    form.append('roomId', TEST_ROOM_ID);
    form.append('streamType', streamType);
    form.append('chunkIndex', chunkIndex.toString());
    form.append('timestamp', Date.now().toString());
    
    try {
        const response = await fetch(`${SERVER_URL}/api/upload-chunk`, {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log(`✅ Upload successful:`, result);
        } else {
            console.error(`❌ Upload failed:`, result);
        }
        
        // Clean up test file
        await fs.remove(audioFile);
        
        return response.ok;
    } catch (error) {
        console.error(`❌ Upload error:`, error.message);
        await fs.remove(audioFile);
        return false;
    }
}

async function testRecordingComplete() {
    console.log(`\n🏁 Testing recording completion...`);
    
    try {
        const response = await fetch(`${SERVER_URL}/api/recording-complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: TEST_ROOM_ID,
                totalChunks: 4,
                duration: 60000
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log(`✅ Recording marked complete:`, result);
        } else {
            console.error(`❌ Recording completion failed:`, result);
        }
        
        return response.ok;
    } catch (error) {
        console.error(`❌ Completion error:`, error.message);
        return false;
    }
}

async function checkRecordingFiles() {
    console.log(`\n📁 Checking recording files...`);
    
    const recordingsDir = path.join(__dirname, 'recordings');
    
    if (!await fs.pathExists(recordingsDir)) {
        console.error(`❌ Recordings directory doesn't exist!`);
        return false;
    }
    
    const dirs = await fs.readdir(recordingsDir);
    const testDir = dirs.find(d => d.includes(TEST_ROOM_ID.substring(0, 8)));
    
    if (!testDir) {
        console.error(`❌ No directory created for test room ${TEST_ROOM_ID}`);
        console.log(`   Existing directories:`, dirs);
        return false;
    }
    
    console.log(`✅ Found recording directory: ${testDir}`);
    
    const dirPath = path.join(recordingsDir, testDir);
    const files = await fs.readdir(dirPath);
    
    console.log(`📄 Files in directory:`, files);
    
    // Check for metadata
    if (files.includes('metadata.json')) {
        const metadata = await fs.readJson(path.join(dirPath, 'metadata.json'));
        console.log(`✅ Metadata found with ${metadata.chunks?.length || 0} chunks`);
    } else {
        console.error(`❌ No metadata.json found`);
    }
    
    return true;
}

async function runTests() {
    console.log('🧪 Starting Recording System Tests');
    console.log('=' .repeat(50));
    
    // Install node-fetch if needed
    try {
        require.resolve('node-fetch');
        require.resolve('form-data');
    } catch(e) {
        console.log('📦 Installing test dependencies...');
        require('child_process').execSync('npm install node-fetch@2 form-data', { stdio: 'inherit' });
    }
    
    console.log(`\n🆔 Test Room ID: ${TEST_ROOM_ID}`);
    
    // Test uploading chunks
    let success = true;
    
    // Upload 2 local chunks
    success = await testChunkUpload(0, 'local') && success;
    success = await testChunkUpload(1, 'local') && success;
    
    // Upload 2 remote chunks  
    success = await testChunkUpload(0, 'remote') && success;
    success = await testChunkUpload(1, 'remote') && success;
    
    // Mark recording complete
    success = await testRecordingComplete() && success;
    
    // Check files were created
    success = await checkRecordingFiles() && success;
    
    console.log('\n' + '=' .repeat(50));
    if (success) {
        console.log('✅ All tests passed!');
    } else {
        console.log('❌ Some tests failed - check the output above');
    }
}

// Run tests
runTests().catch(console.error);