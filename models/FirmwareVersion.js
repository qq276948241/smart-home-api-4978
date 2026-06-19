const BaseModel = require('./BaseModel');
const { getData, nextId, now, saveData } = require('../config/database');

class FirmwareVersion extends BaseModel {
  constructor() {
    super('firmware_versions');
  }

  findByDeviceType(deviceType) {
    return this._rows()
      .filter(r => r.device_type === deviceType && r.is_published == 1)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }

  findLatest(deviceType) {
    return this._rows()
      .filter(r => r.device_type === deviceType && r.is_published == 1)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0] || null;
  }

  createUpgradeHistory(deviceId, firmwareId) {
    const rows = getData().device_firmware_history;
    const record = {
      id: nextId('device_firmware_history'),
      device_id: parseInt(deviceId),
      firmware_id: parseInt(firmwareId),
      status: 'upgrading',
      started_at: now(),
      completed_at: null,
      error_message: null
    };
    rows.push(record);
    saveData();
    return record;
  }

  updateUpgradeStatus(historyId, status, errorMessage = null) {
    const idNum = parseInt(historyId);
    const rows = getData().device_firmware_history;
    const idx = rows.findIndex(r => r.id === idNum);
    if (idx < 0) return null;
    const upd = { status };
    if (status === 'completed' || status === 'failed') {
      upd.completed_at = now();
    }
    if (errorMessage) upd.error_message = errorMessage;
    rows[idx] = { ...rows[idx], ...upd };
    saveData();
    return rows[idx];
  }

  getUpgradeHistory(deviceId) {
    const idNum = parseInt(deviceId);
    const history = (getData().device_firmware_history || []).filter(h => h.device_id === idNum);
    const fws = this._rows();
    return history
      .map(h => {
        const fw = fws.find(f => f.id === h.firmware_id);
        return {
          ...h,
          version: fw ? fw.version : null,
          device_type: fw ? fw.device_type : null,
          release_notes: fw ? fw.release_notes : null
        };
      })
      .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
  }
}

module.exports = new FirmwareVersion();
