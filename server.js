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

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    
    const room = rooms.get(roomId) || { users: [] };
    room.users.push(socket.id);
    rooms.set(roomId, room);
    
    const otherUsers = room.users.filter(id => id !== socket.id);
    socket.emit('other-users', otherUsers);
    
    socket.to(roomId).emit('user-joined', socket.id);
    
    socket.on('offer', (offer, to) => {
      io.to(to).emit('offer', offer, socket.id);
    });
    
    socket.on('answer', (answer, to) => {
      io.to(to).emit('answer', answer, socket.id);
    });
    
    socket.on('ice-candidate', (candidate, to) => {
      io.to(to).emit('ice-candidate', candidate, socket.id);
    });
    
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      room.users = room.users.filter(id => id !== socket.id);
      if (room.users.length === 0) {
        rooms.delete(roomId);
      } else {
        rooms.set(roomId, room);
      }
      socket.to(roomId).emit('user-left', socket.id);
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