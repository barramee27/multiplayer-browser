/**
 * Multiplayer Browser - Backend Server
 * Rooms, cursor sync, navigation sync, text chat, voice signaling (WebRTC)
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e6,
  perMessageDeflate: false,
});

// In-memory room state
const rooms = new Map(); // roomId -> { users: Map<socketId, {id, name, color}>, createdAt }
const dinoGames = new Map(); // roomId -> { dinoY, dinoVel, obstacles, score, frame, gameOver, seed, lastObstacle }

const DINO = {
  GRAVITY: 0.6,
  JUMP: -12,
  SPEED: 3,
  OBSTACLE_W: 20,
  OBSTACLE_H: 40,
  GROUND_Y: 120,
  DINO_H: 40,
};
const TICK_RATE = 120;

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ensureDinoGame(roomId) {
  if (!dinoGames.has(roomId)) {
    const seed = (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0;
    dinoGames.set(roomId, {
      dinoY: DINO.GROUND_Y - DINO.DINO_H,
      dinoVel: 0,
      obstacles: [],
      score: 0,
      frame: 0,
      gameOver: false,
      lastObstacle: 0,
      random: mulberry32(seed),
    });
  }
  return dinoGames.get(roomId);
}

function tickDinoGame(roomId) {
  const g = ensureDinoGame(roomId);
  const rnd = g.random;
  if (g.gameOver) return;
  g.dinoVel += DINO.GRAVITY;
  g.dinoY += g.dinoVel;
  if (g.dinoY >= DINO.GROUND_Y - DINO.DINO_H) {
    g.dinoY = DINO.GROUND_Y - DINO.DINO_H;
    g.dinoVel = 0;
  }
  const minGap = 80 + (rnd() * 60) | 0;
  if (g.frame - g.lastObstacle > minGap) {
    g.obstacles.push({
      x: 600,
      y: DINO.GROUND_Y - DINO.OBSTACLE_H,
      w: DINO.OBSTACLE_W,
      h: DINO.OBSTACLE_H,
    });
    g.lastObstacle = g.frame;
  }
  for (let i = g.obstacles.length - 1; i >= 0; i--) {
    g.obstacles[i].x -= DINO.SPEED;
    if (g.obstacles[i].x + DINO.OBSTACLE_W <= 0) g.obstacles.splice(i, 1);
  }
  g.score = Math.floor(g.frame / 5);
  const dinoRight = 50 + 30 - 5;
  const dinoBottom = g.dinoY + DINO.DINO_H - 5;
  for (const o of g.obstacles) {
    if (o.x + o.w > 55 && o.x < dinoRight && o.y + o.h > g.dinoY + 5 && o.y < dinoBottom) {
      g.gameOver = true;
      break;
    }
  }
  g.frame++;
}

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#F1948A', '#82E0AA'
];

function getColor(index) {
  return COLORS[index % COLORS.length];
}

function ensureRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      users: new Map(),
      createdAt: Date.now(),
      messages: [],
    });
  }
  return rooms.get(roomId);
}

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, userName }) => {
    const room = ensureRoom(roomId);
    const userCount = room.users.size;
    const color = getColor(userCount);

    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = userName || `User_${socket.id.slice(-6)}`;
    socket.userColor = color;

    room.users.set(socket.id, {
      id: socket.id,
      name: socket.userName,
      color,
    });

    // Send current room state to joiner
    const users = Array.from(room.users.entries()).map(([sid, u]) => ({
      id: sid,
      name: u.name,
      color: u.color,
    }));
    socket.emit('room-joined', {
      roomId,
      myId: socket.id,
      users,
      messages: room.messages.slice(-50),
      currentUrl: room.currentUrl || null,
    });

    // Broadcast to others
    socket.to(roomId).emit('user-joined', {
      id: socket.id,
      name: socket.userName,
      color,
    });
  });

  socket.on('cursor-move', (data) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('cursor-move', {
        id: socket.id,
        name: socket.userName,
        color: socket.userColor,
        x: data.x,
        y: data.y,
      });
    }
  });

  socket.on('navigate', (url) => {
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) room.currentUrl = url;
      socket.to(socket.roomId).emit('navigate', { url, by: socket.userName });
    }
  });

  socket.on('chat-message', (text) => {
    if (socket.roomId && text && text.trim()) {
      const room = rooms.get(socket.roomId);
      const msg = {
        id: uuidv4(),
        userId: socket.id,
        userName: socket.userName,
        userColor: socket.userColor,
        text: text.trim().slice(0, 2000),
        ts: Date.now(),
      };
      if (room) {
        room.messages.push(msg);
        if (room.messages.length > 200) room.messages = room.messages.slice(-100);
      }
      io.to(socket.roomId).emit('chat-message', msg);
    }
  });

  // Code injection - broadcast HTML/JS/CSS to all in room (sandboxed on client)
  socket.on('code-inject', (data) => {
    if (socket.roomId && data) {
      const { type, content } = data;
      const allowed = ['html', 'js', 'css'];
      if (allowed.includes(type) && typeof content === 'string' && content.length <= 50000) {
        io.to(socket.roomId).emit('code-inject', {
          userId: socket.id,
          userName: socket.userName,
          userColor: socket.userColor,
          type,
          content: content.slice(0, 50000),
        });
      }
    }
  });

  socket.on('annotation-add', (data) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('annotation-add', {
        ...data,
        userId: socket.id,
        userName: socket.userName,
        userColor: socket.userColor,
      });
    }
  });

  socket.on('annotation-remove', (id) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('annotation-remove', id);
    }
  });

  socket.on('scroll-sync', (data) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('scroll-sync', {
        id: socket.id,
        scrollX: data.scrollX,
        scrollY: data.scrollY,
      });
    }
  });

  socket.on('dino-join', () => {
    if (socket.roomId) {
      const g = ensureDinoGame(socket.roomId);
      const o = [];
      for (let i = 0; i < g.obstacles.length; i++) o.push({ x: g.obstacles[i].x, y: g.obstacles[i].y, w: g.obstacles[i].w, h: g.obstacles[i].h });
      socket.emit('dino-state', [g.dinoY, g.dinoVel, o, g.score, g.gameOver ? 1 : 0]);
    }
  });

  socket.on('key-sync', (data) => {
    if (socket.roomId) {
      const g = ensureDinoGame(socket.roomId);
      const isJump = ['Space', 'ArrowUp', ' '].includes(data.key) || data.code === 'Space' || data.code === 'ArrowUp';
      if (isJump && g.dinoY >= DINO.GROUND_Y - DINO.DINO_H - 1) {
        g.dinoVel = DINO.JUMP;
      }
      if (g.gameOver && isJump) {
        g.dinoY = DINO.GROUND_Y - DINO.DINO_H;
        g.dinoVel = 0;
        g.obstacles = [];
        g.score = 0;
        g.frame = 0;
        g.gameOver = false;
        g.lastObstacle = 0;
      }
      socket.to(socket.roomId).emit('key-sync', {
        id: socket.id,
        key: data.key,
        code: data.code,
        keyCode: data.keyCode,
      });
    }
  });

  // WebRTC voice signaling
  socket.on('voice-offer', ({ to, offer }) => {
    io.to(to).emit('voice-offer', { from: socket.id, offer, userName: socket.userName });
  });
  socket.on('voice-answer', ({ to, answer }) => {
    io.to(to).emit('voice-answer', { from: socket.id, answer });
  });
  socket.on('voice-ice', ({ to, candidate }) => {
    io.to(to).emit('voice-ice', { from: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        room.users.delete(socket.id);
        if (room.users.size === 0) {
          rooms.delete(socket.roomId);
          dinoGames.delete(socket.roomId);
        }
      }
      socket.to(socket.roomId).emit('user-left', { id: socket.id });
    }
  });
});

setInterval(() => {
  dinoGames.forEach((g, roomId) => {
    tickDinoGame(roomId);
    const o = [];
    for (let i = 0; i < g.obstacles.length; i++) o.push({ x: g.obstacles[i].x, y: g.obstacles[i].y, w: g.obstacles[i].w, h: g.obstacles[i].h });
    io.to(roomId).emit('dino-state', [g.dinoY, g.dinoVel, o, g.score, g.gameOver ? 1 : 0]);
  });
}, 1000 / TICK_RATE);

app.get('/api/room', (req, res) => {
  const roomId = uuidv4().slice(0, 8);
  ensureRoom(roomId);
  res.json({ roomId });
});

app.post('/api/room', (req, res) => {
  const roomId = uuidv4().slice(0, 8);
  ensureRoom(roomId);
  res.json({ roomId });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Multiplayer Browser server on http://localhost:${PORT}`);
});
