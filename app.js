require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');

const { initWebSocket } = require('./websocket/manager');
const { generalLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const ScheduleController = require('./controllers/ScheduleController');
const { getData, saveData, nextId, now } = require('./config/database');
const bcrypt = require('bcryptjs');

const userRoutes = require('./routes/userRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const roomRoutes = require('./routes/roomRoutes');
const sceneRoutes = require('./routes/sceneRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const messageRoutes = require('./routes/messageRoutes');
const firmwareRoutes = require('./routes/firmwareRoutes');
const energyRoutes = require('./routes/energyRoutes');

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(generalLimiter);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${req.ip}`);
  next();
});

app.get('/', (req, res) => {
  res.json({
    name: '智能家居设备控制接口服务',
    version: '1.1.0',
    status: 'running',
    docs: {
      user: {
        register: 'POST /api/users/register',
        login: 'POST /api/users/login',
        profile: 'GET /api/users/profile',
      },
      device: {
        list: 'GET /api/devices',
        create: 'POST /api/devices',
        control: 'POST /api/devices/:id/control',
      },
      scene: {
        execute: 'POST /api/scenes/:id/execute',
      },
      energy: {
        room_stats: 'GET /api/energy/rooms?period=day&sort_by=energy&order=desc',
        overview: 'GET /api/energy/overview',
        device_stats: 'GET /api/energy/devices/:device_id',
        power_config: 'GET /api/energy/power-config',
      },
      websocket: {
        url: `ws://localhost:${PORT}?token=YOUR_JWT_TOKEN`,
        events: [
          'device_update - 设备状态变更',
          'scene_execute - 场景执行状态',
          'schedule_execute - 定时任务触发',
          'firmware_update - 固件升级进度',
          'message - 消息通知',
        ]
      }
    },
    timestamp: Date.now()
  });
});

app.use('/api/users', userRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/scenes', sceneRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/firmware', firmwareRoutes);
app.use('/api/energy', energyRoutes);

app.use('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);

initWebSocket(server);

(function initDefaultData() {
  const data = getData();
  if (!data._meta) data._meta = {};
  if (!data._meta.initialized) {
    const existingAdmin = data.users.find(u => u.username === 'admin');
    if (!existingAdmin) {
      const hashed = bcrypt.hashSync('admin123', 10);
      const uid = nextId('users');
      data.users.push({
        id: uid,
        username: 'admin',
        email: 'admin@smarthome.com',
        password: hashed,
        role: 'admin',
        created_at: now(),
        updated_at: now()
      });
      console.log('[Init] 创建默认管理员: admin / admin123');
    }
    data._meta.initialized = true;
    data._meta.version = '1.0.0';
    saveData(true);
    console.log('[Init] 数据库初始化完成');
  }
})();

process.nextTick(() => {
  try {
    ScheduleController.loadAllSchedules();
  } catch (err) {
    console.error('[Schedule] 加载定时任务失败:', err.message);
  }
});

process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n收到SIGINT信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UnhandledRejection]:', reason);
});

server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  智能家居设备控制接口服务启动成功!`);
  console.log(`========================================`);
  console.log(`  API地址:    http://localhost:${PORT}`);
  console.log(`  WebSocket:  ws://localhost:${PORT}?token=YOUR_TOKEN`);
  console.log(`  健康检查:   http://localhost:${PORT}/health`);
  console.log(`  默认账号:   admin / admin123`);
  console.log(`========================================\n`);
});

module.exports = app;
