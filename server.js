const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;

const rooms = new Map();

app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/create-room', (req, res) => {
  const roomId = uuidv4();
  rooms.set(roomId, { users: [], createdAt: Date.now() });
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers.host;
  res.json({ roomId, url: `${protocol}://${host}/room/${roomId}` });
});

app.get('/room/:roomId', (req, res) => {
  const { roomId } = req.params;
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { users: [], createdAt: Date.now() });
  }
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  let currentRoom = null;

  socket.on('join-room', async (roomId) => {
    console.log(`User ${socket.id} joining room ${roomId}`);
    currentRoom = roomId;
    socket.join(roomId);
    
    // Get all clients in the room using Socket.IO's adapter
    const clientsInRoom = await io.in(roomId).allSockets();
    const otherUsers = Array.from(clientsInRoom).filter(id => id !== socket.id);
    
    console.log(`Room ${roomId} now has ${clientsInRoom.size} users`);
    console.log(`Other users in room: ${otherUsers.join(', ')}`);
    
    // Send the list of other users to the newly joined client
    socket.emit('other-users', otherUsers);
    
    // Notify other users in the room that someone joined
    socket.to(roomId).emit('user-joined', socket.id);
    
    socket.on('offer', (offer, to) => {
      console.log(`Relaying offer from ${socket.id} to ${to}`);
      io.to(to).emit('offer', offer, socket.id);
    });
    
    socket.on('answer', (answer, to) => {
      console.log(`Relaying answer from ${socket.id} to ${to}`);
      io.to(to).emit('answer', answer, socket.id);
    });
    
    socket.on('ice-candidate', (candidate, to) => {
      io.to(to).emit('ice-candidate', candidate, socket.id);
    });
    
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id} from room ${currentRoom}`);
      if (currentRoom) {
        socket.to(currentRoom).emit('user-left', socket.id);
      }
    });
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.length === 0 && now - room.createdAt > 3600000) {
      rooms.delete(roomId);
    }
  }
}, 300000);

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});