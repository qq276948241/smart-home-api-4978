const Message = require('../models/Message');
const Response = require('../utils/response');
const { getWSManager } = require('../websocket/manager');

class MessageController {
  static async list(req, res) {
    const { is_read, type } = req.query;
    const filters = {};
    if (is_read !== undefined) filters.is_read = is_read === 'true' || is_read === '1';
    if (type) filters.type = type;

    const messages = Message.findByUserId(req.user.id, filters);
    const unreadCount = Message.unreadCount(req.user.id);

    return Response.success(res, {
      items: messages,
      unread_count: unreadCount
    });
  }

  static async detail(req, res) {
    const message = Message.findById(req.params.id);

    if (!message || message.user_id !== req.user.id) {
      return Response.error(res, '消息不存在或无权访问', 404);
    }

    if (!message.is_read) {
      Message.markAsRead(req.user.id, message.id);
      message.is_read = 1;
    }

    return Response.success(res, message);
  }

  static async markAsRead(req, res) {
    const { messageIds } = req.body;

    if (messageIds && Array.isArray(messageIds)) {
      for (const id of messageIds) {
        Message.markAsRead(req.user.id, id);
      }
    } else {
      Message.markAsRead(req.user.id, req.params.id);
    }

    const wsManager = getWSManager();
    wsManager.broadcastMessage(req.user.id, {
      type: 'read_update',
      unread_count: Message.unreadCount(req.user.id)
    });

    return Response.success(res, {
      unread_count: Message.unreadCount(req.user.id)
    }, '消息已标记为已读');
  }

  static async markAllAsRead(req, res) {
    Message.markAllAsRead(req.user.id);

    const wsManager = getWSManager();
    wsManager.broadcastMessage(req.user.id, {
      type: 'all_read',
      unread_count: 0
    });

    return Response.success(res, { unread_count: 0 }, '所有消息已标记为已读');
  }

  static async unreadCount(req, res) {
    const count = Message.unreadCount(req.user.id);
    return Response.success(res, { unread_count: count });
  }

  static async remove(req, res) {
    const message = Message.findById(req.params.id);

    if (!message || message.user_id !== req.user.id) {
      return Response.error(res, '消息不存在或无权访问', 404);
    }

    Message.delete(message.id);
    return Response.success(res, null, '消息删除成功');
  }

  static async clear(req, res) {
    const messages = Message.findByUserId(req.user.id);
    messages.forEach(m => Message.delete(m.id));
    return Response.success(res, null, '消息已清空');
  }

  static async push(userId, messageData) {
    const message = Message.create({
      user_id: userId,
      type: messageData.type || 'notification',
      title: messageData.title,
      content: messageData.content || null,
      related_type: messageData.related_type || null,
      related_id: messageData.related_id || null,
      is_read: 0
    });

    try {
      const wsManager = getWSManager();
      wsManager.broadcastMessage(userId, {
        type: 'new_message',
        message,
        unread_count: Message.unreadCount(userId)
      });
    } catch {}

    return message;
  }
}

module.exports = MessageController;
