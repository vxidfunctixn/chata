const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const { createAdapter } = require('@socket.io/redis-adapter');

const app = express();
const httpServer = createServer(app);

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:9000')
  .split(',')
  .map((o) => o.trim());

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

// --- Dragonfly / Redis adapter ---
const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const subClient = pubClient.duplicate();

pubClient.on('error', (err) => console.error('Redis pub error:', err));
subClient.on('error', (err) => console.error('Redis sub error:', err));

io.adapter(createAdapter(pubClient, subClient));

// Aktywni typerzy per pokój: Map<roomId, Map<socketId, { username, text }>>
const roomTypers = new Map();
// Użytkownicy per pokój: Map<roomId, Map<socketId, username>>
const roomMembers = new Map();

const broadcastDrafts = (roomId) => {
  const drafts = roomTypers.has(roomId)
    ? [...roomTypers.get(roomId).values()]
    : [];
  io.to(roomId).emit('typingDrafts', drafts);
};

const broadcastMembers = (roomId) => {
  const members = roomMembers.has(roomId)
    ? [...roomMembers.get(roomId).values()]
    : [];
  io.to(roomId).emit('roomUsers', members);
};

// --- Socket.io events ---
io.on('connection', (socket) => {
  console.log(`[+] connected: ${socket.id}`);

  let currentRoom = null;
  let currentUser = null;

  socket.on('joinRoom', async ({ roomId, username }) => {
    // Opuść poprzedni pokój
    if (currentRoom) {
      socket.leave(currentRoom);
      if (roomTypers.has(currentRoom)) {
        roomTypers.get(currentRoom).delete(socket.id);
        broadcastDrafts(currentRoom);
      }
      if (roomMembers.has(currentRoom)) {
        roomMembers.get(currentRoom).delete(socket.id);
        broadcastMembers(currentRoom);
      }
      io.to(currentRoom).emit('system', {
        text: `${currentUser} opuścił(a) pokój`,
        createdAt: Date.now(),
      });
    }

    currentRoom = roomId;
    currentUser = username;
    await socket.join(roomId);
    if (!roomMembers.has(roomId)) roomMembers.set(roomId, new Map());
    roomMembers.get(roomId).set(socket.id, username);
    broadcastMembers(roomId);
    console.log(`[joinRoom] ${username} joined #${roomId}`);

    // Historia z Dragonfly (ostatnie 50, zapisane newest-first → odwróć)
    try {
      const raw = await pubClient.lrange(`room:${roomId}:messages`, 0, 49);
      const history = raw.map((r) => JSON.parse(r)).reverse();
      socket.emit('history', history);
    } catch (e) {
      console.error('History fetch error:', e);
      socket.emit('history', []);
    }

    io.to(roomId).emit('system', {
      text: `${username} dołączył(a) do pokoju`,
      createdAt: Date.now(),
    });
    console.log(`[room] ${username} joined #${roomId}`);
  });

  socket.on('leaveRoom', () => {
    if (!currentRoom) return;
    socket.leave(currentRoom);
    if (roomTypers.has(currentRoom)) {
      roomTypers.get(currentRoom).delete(socket.id);
      broadcastDrafts(currentRoom);
    }
    if (roomMembers.has(currentRoom)) {
      roomMembers.get(currentRoom).delete(socket.id);
      broadcastMembers(currentRoom);
    }
    io.to(currentRoom).emit('system', {
      text: `${currentUser} opuścił(a) pokój`,
      createdAt: Date.now(),
    });
    currentRoom = null;
    currentUser = null;
  });

  socket.on('message', async ({ roomId, text, username }) => {
    if (!roomId || !text?.trim()) return;
    const msg = { text: text.trim(), username, roomId, createdAt: Date.now() };

    // Persystuj w Dragonfly (max 200 wiadomości)
    try {
      await pubClient.lpush(`room:${roomId}:messages`, JSON.stringify(msg));
      await pubClient.ltrim(`room:${roomId}:messages`, 0, 199);
    } catch (e) {
      console.error('Persist error:', e);
    }

    io.to(roomId).emit('message', msg);
  });

  socket.on('typing', ({ roomId, username, text, cursor, selectionEnd }) => {
    if (!roomId || !username) return;
    if (!roomTypers.has(roomId)) roomTypers.set(roomId, new Map());
    const t = text ?? '';
    const cur = cursor ?? t.length;
    roomTypers.get(roomId).set(socket.id, { username, text: t, cursor: cur, selectionEnd: selectionEnd ?? cur, idle: false });
    const drafts = [...roomTypers.get(roomId).values()];
    socket.to(roomId).emit('typingDrafts', drafts);
  });

  socket.on('idleTyping', ({ roomId }) => {
    if (!roomId || !roomTypers.has(roomId)) return;
    const entry = roomTypers.get(roomId).get(socket.id);
    if (!entry) return;
    entry.idle = true;
    const drafts = [...roomTypers.get(roomId).values()];
    socket.to(roomId).emit('typingDrafts', drafts);
  });

  socket.on('stopTyping', ({ roomId }) => {
    if (!roomId || !roomTypers.has(roomId)) return;
    roomTypers.get(roomId).delete(socket.id);
    const drafts = [...roomTypers.get(roomId).values()];
    socket.to(roomId).emit('typingDrafts', drafts);
  });

  socket.on('disconnect', () => {
    console.log(`[-] disconnected: ${socket.id}`);
    if (currentRoom) {
      if (roomTypers.has(currentRoom)) {
        roomTypers.get(currentRoom).delete(socket.id);
        broadcastDrafts(currentRoom);
      }
      if (roomMembers.has(currentRoom)) {
        roomMembers.get(currentRoom).delete(socket.id);
        broadcastMembers(currentRoom);
      }
      io.to(currentRoom).emit('system', {
        text: `${currentUser} rozłączył(a) się`,
        createdAt: Date.now(),
      });
    }
  });
});

// --- Health check ---
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

httpServer.listen(3001, () => console.log('Backend running on :3001'));
