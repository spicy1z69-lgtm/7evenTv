
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['polling', 'websocket'],
  allowUpgrades: true,
});

io.engine.on('connection_error', (error) => {
  console.error('Socket.IO handshake failed:', {
    code: error.code,
    message: error.message,
    method: error.req?.method,
    path: error.req?.url?.split('?')[0],
    origin: error.req?.headers?.origin,
    transport: error.req?._query?.transport,
  });
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.info('Socket.IO client connected:', {
    id: socket.id,
    transport: socket.conn.transport.name,
    origin: socket.handshake.headers.origin,
  });

  socket.conn.on('upgrade', (transport) => {
    console.info('Socket.IO transport upgraded:', {
      id: socket.id,
      transport: transport.name,
    });
  });

  socket.conn.on('upgradeError', (error) => {
    console.warn('Socket.IO transport upgrade failed:', {
      id: socket.id,
      message: error.message,
    });
  });

  socket.on('join-room', (payload) => {
    if (!payload || typeof payload !== 'object') {
      console.warn('Ignored invalid join-room payload:', socket.id);
      return;
    }

    const { roomId, userName } = payload;
    if (typeof roomId !== 'string' || !roomId.trim()) return;

    const room = roomId.trim();
    socket.join(room);

    if (!rooms.has(room)) {
      rooms.set(room, {
        playing: false,
        currentTime: 0,
        videoId: 'demo',
        updatedAt: Date.now(),
      });
    }

    socket.emit('room-state', rooms.get(room));

    socket.to(room).emit('user-joined', {
      userName: userName || 'مشاهد جديد',
    });

    console.log(`${socket.id} joined room: ${room}`);
  });

  socket.on('playback-update', (payload) => {
    if (!payload || typeof payload !== 'object') {
      console.warn('Ignored invalid playback-update payload:', socket.id);
      return;
    }

    const { roomId, playing, currentTime } = payload;
    if (typeof roomId !== 'string' || !rooms.has(roomId)) return;
    if (typeof playing !== 'boolean') return;
    if (!Number.isFinite(currentTime) || currentTime < 0) return;

    const state = {
      ...rooms.get(roomId),
      playing,
      currentTime,
      updatedAt: Date.now(),
    };

    rooms.set(roomId, state);
    socket.to(roomId).emit('room-state', state);
  });

  socket.on('disconnect', (reason) => {
    console.info('Socket.IO client disconnected:', {
      id: socket.id,
      reason,
    });
  });
});

app.get('/', (req, res) => {
  res.send('7evenTv Sync Server is running!');
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`7evenTv Sync Server running on port ${PORT}`);
});
