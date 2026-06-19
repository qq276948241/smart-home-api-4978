const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');

class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.userConnections = new Map();
    this.deviceSubscriptions = new Map();
    this.init();
  }

  init() {
    this.wss.on('connection', (ws, req) => {
      const query = url.parse(req.url, true).query;
      const token = query.token;

      if (!token) {
        ws.close(1008, '缺少认证令牌');
        return;
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        ws.userId = decoded.userId;
        ws.isAlive = true;

        if (!this.userConnections.has(ws.userId)) {
          this.userConnections.set(ws.userId, new Set());
        }
        this.userConnections.get(ws.userId).add(ws);

        ws.on('pong', () => {
          ws.isAlive = true;
        });

        ws.on('message', (data) => {
          this.handleMessage(ws, data);
        });

        ws.on('close', () => {
          this.cleanupConnection(ws);
        });

        this.sendToClient(ws, {
          type: 'connected',
          message: 'WebSocket连接成功',
          userId: ws.userId
        });
      } catch (err) {
        ws.close(1008, '令牌无效');
      }
    });

    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          this.cleanupConnection(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  cleanupConnection(ws) {
    if (ws.userId && this.userConnections.has(ws.userId)) {
      this.userConnections.get(ws.userId).delete(ws);
      if (this.userConnections.get(ws.userId).size === 0) {
        this.userConnections.delete(ws.userId);
      }
    }

    for (const [deviceId, users] of this.deviceSubscriptions.entries()) {
      if (users.has(ws)) {
        users.delete(ws);
        if (users.size === 0) {
          this.deviceSubscriptions.delete(deviceId);
        }
      }
    }
  }

  handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'subscribe_device':
          if (message.deviceId) {
            if (!this.deviceSubscriptions.has(message.deviceId)) {
              this.deviceSubscriptions.set(message.deviceId, new Set());
            }
            this.deviceSubscriptions.get(message.deviceId).add(ws);
            this.sendToClient(ws, {
              type: 'subscribed',
              deviceId: message.deviceId,
              message: '已订阅设备状态更新'
            });
          }
          break;

        case 'unsubscribe_device':
          if (message.deviceId && this.deviceSubscriptions.has(message.deviceId)) {
            this.deviceSubscriptions.get(message.deviceId).delete(ws);
            this.sendToClient(ws, {
              type: 'unsubscribed',
              deviceId: message.deviceId,
              message: '已取消订阅设备状态更新'
            });
          }
          break;

        case 'ping':
          this.sendToClient(ws, { type: 'pong', timestamp: Date.now() });
          break;

        default:
          this.sendToClient(ws, {
            type: 'error',
            message: '未知的消息类型'
          });
      }
    } catch (err) {
      this.sendToClient(ws, {
        type: 'error',
        message: '消息格式错误'
      });
    }
  }

  sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  broadcastToUser(userId, message) {
    const connections = this.userConnections.get(userId);
    if (connections) {
      connections.forEach((ws) => {
        this.sendToClient(ws, message);
      });
    }
  }

  broadcastDeviceState(device, userId = null, action = 'state_change') {
    const message = {
      type: 'device_update',
      action,
      device: {
        id: device.id,
        name: device.name,
        type: device.type,
        status: device.status,
        is_online: !!device.is_online,
        state: typeof device.state === 'string' ? JSON.parse(device.state || '{}') : device.state || {},
        room_id: device.room_id,
        updated_at: device.updated_at
      },
      timestamp: Date.now()
    };

    if (userId) {
      this.broadcastToUser(userId, message);
    }

    const subscriptions = this.deviceSubscriptions.get(device.id);
    if (subscriptions) {
      subscriptions.forEach((ws) => {
        if (!userId || ws.userId !== userId) {
          this.sendToClient(ws, message);
        }
      });
    }
  }

  broadcastSceneExecute(sceneId, userId, status, data = {}) {
    this.broadcastToUser(userId, {
      type: 'scene_execute',
      sceneId,
      status,
      data,
      timestamp: Date.now()
    });
  }

  broadcastMessage(userId, message) {
    this.broadcastToUser(userId, {
      type: 'message',
      message,
      timestamp: Date.now()
    });
  }

  broadcastScheduleExecute(scheduleId, userId, status, data = {}) {
    this.broadcastToUser(userId, {
      type: 'schedule_execute',
      scheduleId,
      status,
      data,
      timestamp: Date.now()
    });
  }

  broadcastFirmwareUpdate(deviceId, userId, status, progress = 0) {
    this.broadcastToUser(userId, {
      type: 'firmware_update',
      deviceId,
      status,
      progress,
      timestamp: Date.now()
    });
  }
}

let wsManager = null;

const initWebSocket = (server) => {
  if (!wsManager) {
    wsManager = new WebSocketManager(server);
  }
  return wsManager;
};

const getWSManager = () => {
  if (!wsManager) {
    throw new Error('WebSocket尚未初始化');
  }
  return wsManager;
};

module.exports = { initWebSocket, getWSManager };
