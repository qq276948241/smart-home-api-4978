const BaseModel = require('./BaseModel');
const { now, saveData } = require('../config/database');

class Device extends BaseModel {
  constructor() {
    super('devices');
  }

  findByUserId(userId, filters = {}) {
    let rows = this._rows().filter(r => r.user_id == userId);
    if (filters.room_id !== undefined && filters.room_id !== null) {
      rows = rows.filter(r => r.room_id == filters.room_id);
    }
    if (filters.type) {
      rows = rows.filter(r => r.type === filters.type);
    }
    if (filters.status) {
      rows = rows.filter(r => r.status === filters.status);
    }
    return rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }

  findBySerialNumber(serialNumber) {
    return this._rows().find(r => r.serial_number === serialNumber) || null;
  }

  updateState(id, state) {
    const idNum = parseInt(id);
    const rows = this._rows();
    const idx = rows.findIndex(r => r.id === idNum);
    if (idx < 0) return null;
    const stateStr = typeof state === 'string' ? state : JSON.stringify(state);
    rows[idx] = { ...rows[idx], state: stateStr, updated_at: now() };
    saveData();
    return rows[idx];
  }

  updateOnlineStatus(id, isOnline, status = null) {
    const idNum = parseInt(id);
    const rows = this._rows();
    const idx = rows.findIndex(r => r.id === idNum);
    if (idx < 0) return null;
    const upd = {
      is_online: isOnline ? 1 : 0,
      last_seen: now(),
      updated_at: now()
    };
    if (status !== null) upd.status = status;
    rows[idx] = { ...rows[idx], ...upd };
    saveData();
    return rows[idx];
  }
}

module.exports = new Device();
