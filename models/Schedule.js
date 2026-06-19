const BaseModel = require('./BaseModel');
const { now, saveData } = require('../config/database');

class Schedule extends BaseModel {
  constructor() {
    super('schedules');
  }

  findByUserId(userId) {
    return this._rows()
      .filter(r => r.user_id == userId)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }

  findEnabled() {
    return this._rows().filter(r => r.is_enabled == 1);
  }

  updateRunStatus(id, lastRun, nextRun) {
    const idNum = parseInt(id);
    const rows = this._rows();
    const idx = rows.findIndex(r => r.id === idNum);
    if (idx < 0) return;
    rows[idx] = {
      ...rows[idx],
      last_run: lastRun,
      next_run: nextRun,
      updated_at: now()
    };
    saveData();
  }
}

module.exports = new Schedule();
