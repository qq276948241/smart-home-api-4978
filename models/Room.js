const BaseModel = require('./BaseModel');
const { getData } = require('../config/database');

class Room extends BaseModel {
  constructor() {
    super('rooms');
  }

  findByUserId(userId) {
    const rooms = this._rows().filter(r => r.user_id == userId);
    const devices = getData().devices || [];
    return rooms.map(room => ({
      ...room,
      device_count: devices.filter(d => d.room_id === room.id).length
    })).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }
}

module.exports = new Room();
