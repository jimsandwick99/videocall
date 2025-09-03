# WebRTC Video Call Troubleshooting Guide

## Critical Fix: Offer/Answer Collision Resolution

### The Problem
When two peers try to connect simultaneously, both may attempt to create and send offers to each other, causing a signaling collision. This results in:
- Both devices showing "Connected - Waiting for peer..." 
- Console showing "Ignoring offer due to collision"
- Video streams not being established despite successful ICE connection

### The Solution
Implement a **controlled offer flow** where only the newly joining peer initiates offers:

1. **First user (existing user in room):**
   - Joins room and waits
   - When notified of new user, does NOT make an offer
   - Waits to receive offer from the new user
   - Responds with answer only

2. **Second user (new joiner):**
   - Joins room and receives list of existing users
   - Initiates offers to all existing users
   - Handles answers from existing users

### Key Code Components

#### Client-side (room.html)
```javascript
// New users make offers to existing users
socket.on('other-users', async (users) => {
    if (users.length > 0) {
        // I'm the new user - I make offers
        users.forEach(userId => makeOffer(userId));
    }
});

// Existing users wait for offers from new users
socket.on('user-joined', async (userId) => {
    // I'm existing user - I wait for offer
    // Do NOT make offer here
});
```

#### Server-side (server.js)
```javascript
// Use Socket.IO's built-in room management
const clientsInRoom = await io.in(roomId).allSockets();
const otherUsers = Array.from(clientsInRoom).filter(id => id !== socket.id);

// Send existing users to new joiner
socket.emit('other-users', otherUsers);

// Notify existing users of new joiner
socket.to(roomId).emit('user-joined', socket.id);
```

## Common Issues and Solutions

### 1. No Remote Video Despite Connection
**Symptoms:**
- ICE state shows "connected"
- "Received remote stream" in console
- But no video visible

**Solutions:**
- Check CSS: Ensure video elements have min-height and display:block
- Verify TURN servers are configured for NAT traversal
- Check if remote video element srcObject is being set

### 2. ICE Candidate Errors
**Error:** "Failed to execute 'addIceCandidate': The remote description was null"

**Solution:** Queue ICE candidates until remote description is set:
```javascript
let pendingCandidates = [];

socket.on('ice-candidate', async (candidate) => {
    if (!peerConnection?.remoteDescription) {
        pendingCandidates.push(candidate);
        return;
    }
    await peerConnection.addIceCandidate(candidate);
    // Process any pending candidates
    for (const pending of pendingCandidates) {
        await peerConnection.addIceCandidate(pending);
    }
    pendingCandidates = [];
});
```

### 3. NAT/Firewall Traversal Issues
**Symptoms:**
- Works on same network but not across different networks
- Mobile to WiFi connections fail

**Solution:** Add TURN servers to ICE configuration:
```javascript
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]
};
```

## Debugging Checklist

1. **Check Browser Console:**
   - Look for offer/answer exchange logs
   - Verify ICE connection state changes
   - Check for any JavaScript errors

2. **Verify Signaling Flow:**
   - First user should see: "I am the first user in the room"
   - Second user should see: "I am the new user, making offers to existing users"
   - No "Ignoring offer due to collision" messages

3. **Check Server Logs:**
   - Users joining rooms correctly
   - Offers/answers being relayed
   - Socket connections stable

4. **Test Environment:**
   - Both devices have camera/microphone permissions
   - HTTPS is used (required for getUserMedia)
   - Firewall not blocking WebRTC ports

## Production Considerations

1. **TURN Server:** Free TURN servers are unreliable. Consider:
   - Twilio TURN
   - Xirsys
   - Self-hosted coturn
   - WebRTC platforms (Daily.co, Agora)

2. **Error Recovery:**
   - Implement reconnection logic
   - Handle network changes
   - Add connection quality monitoring

3. **Scalability:**
   - Current implementation is peer-to-peer (max 2-4 users)
   - For more users, consider SFU (Selective Forwarding Unit)
   - Or use MCU (Multipoint Control Unit) architecture

## Testing Procedure

1. **Local Testing:**
   ```bash
   npm start
   # Open http://localhost:3000 in two browser tabs
   ```

2. **Cross-Device Testing:**
   - Deploy to Render/Heroku/etc
   - Test with devices on different networks
   - Test mobile (4G/5G) to WiFi connections

3. **Debug Mode:**
   - Open browser DevTools on both devices
   - Monitor Console for signaling messages
   - Check Network tab for Socket.IO messages

## Key Lessons Learned

1. **Never let both peers initiate offers** - This causes collisions
2. **Always use Socket.IO's room management** - Don't track users manually
3. **Queue ICE candidates** - They may arrive before remote description
4. **Add comprehensive logging** - Essential for debugging WebRTC issues
5. **Test across different networks early** - Local testing isn't enough

Last working commit: 5666385 (Fix WebRTC offer collision - implement proper signaling flow)