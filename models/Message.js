const BaseModel = require('./BaseModel');
const { saveData } = require('../config/database');

class Message extends BaseModel {
  constructor() {
    super('messages');
  }

  findByUserId(userId, filters = {}) {
    let rows = this._rows().filter(r => r.user_id == userId);
    if (filters.is_read !== undefined) {
      const val = filters.is_read ? 1 : 0;
      rows = rows.filter(r => (r.is_read ? 1 : 0) === val);
    }
    if (filters.type) {
      rows = rows.filter(r => r.type === filters.type);
    }
    return rows
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 100);
  }

  markAsRead(userId, messageId) {
    const idNum = parseInt(messageId);
    const rows = this._rows();
    const idx = rows.findIndex(r => r.id === idNum && r.user_id == userId);
    if (idx < 0) return false;
    rows[idx] = { ...rows[idx], is_read: 1 };
    saveData();
    return true;
  }

  markAllAsRead(userId) {
    const rows = this._rows();
    let changed = false;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].user_id == userId && !rows[i].is_read) {
        rows[i] = { ...rows[i], is_read: 1 };
        changed = true;
      }
    }
    if (changed) saveData();
  }

  unreadCount(userId) {
    return this._rows().filter(r => r.user_id == userId && !r.is_read).length;
  }
}

module.exports = new Message();
