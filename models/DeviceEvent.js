const BaseModel = require('./BaseModel');
const { getData, saveData, nextId, now, getDevicePower } = require('../config/database');

class DeviceEvent extends BaseModel {
  constructor() {
    super('device_events');
  }

  logEvent(deviceId, userId, eventType, extraData = {}) {
    const rows = getData().device_events;
    const record = {
      id: nextId('device_events'),
      device_id: parseInt(deviceId),
      user_id: parseInt(userId),
      event_type: eventType,
      event_data: typeof extraData === 'string' ? extraData : JSON.stringify(extraData),
      created_at: now()
    };
    rows.push(record);
    saveData();
    return record;
  }

  logPowerOn(deviceId, userId, extra = {}) {
    return this.logEvent(deviceId, userId, 'power_on', extra);
  }

  logPowerOff(deviceId, userId, extra = {}) {
    return this.logEvent(deviceId, userId, 'power_off', extra);
  }

  logOnline(deviceId, userId) {
    return this.logEvent(deviceId, userId, 'online', {});
  }

  logOffline(deviceId, userId) {
    return this.logEvent(deviceId, userId, 'offline', {});
  }

  logControl(deviceId, userId, action, params = {}) {
    return this.logEvent(deviceId, userId, 'control', { action, params });
  }

  findByDeviceId(deviceId, startTime = null, endTime = null) {
    const idNum = parseInt(deviceId);
    let rows = this._rows().filter(r => r.device_id === idNum);
    if (startTime) {
      rows = rows.filter(r => r.created_at >= startTime);
    }
    if (endTime) {
      rows = rows.filter(r => r.created_at <= endTime);
    }
    return rows.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  }

  findByUserId(userId, startTime = null, endTime = null) {
    const idNum = parseInt(userId);
    let rows = this._rows().filter(r => r.user_id === idNum);
    if (startTime) {
      rows = rows.filter(r => r.created_at >= startTime);
    }
    if (endTime) {
      rows = rows.filter(r => r.created_at <= endTime);
    }
    return rows.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  }

  calculateDeviceStats(deviceId, startTime, endTime) {
    const events = this.findByDeviceId(deviceId, startTime, endTime);
    if (events.length === 0) {
      return { on_off_count: 0, on_duration_minutes: 0, estimated_kwh: 0 };
    }

    let onOffCount = 0;
    let onDurationMs = 0;
    let lastOnTime = null;
    let isOn = false;

    for (const ev of events) {
      if (ev.event_type === 'power_on' || (ev.event_type === 'control' && this._isPowerOnEvent(ev))) {
        if (!isOn) {
          lastOnTime = new Date(ev.created_at).getTime();
          isOn = true;
          onOffCount++;
        }
      } else if (ev.event_type === 'power_off' || (ev.event_type === 'control' && this._isPowerOffEvent(ev))) {
        if (isOn && lastOnTime) {
          onDurationMs += new Date(ev.created_at).getTime() - lastOnTime;
          isOn = false;
          onOffCount++;
          lastOnTime = null;
        }
      }
    }

    if (isOn && lastOnTime) {
      const endMs = endTime ? new Date(endTime).getTime() : Date.now();
      onDurationMs += endMs - lastOnTime;
    }

    const device = require('./Device').findById(deviceId);
    const powerW = device ? getDevicePower(device.type) : 50;
    const onHours = onDurationMs / (1000 * 60 * 60);
    const estimatedKwh = (powerW * onHours) / 1000;

    return {
      on_off_count: onOffCount,
      on_duration_minutes: Math.round(onDurationMs / (1000 * 60) * 100) / 100,
      on_duration_hours: Math.round(onHours * 100) / 100,
      power_watts: powerW,
      estimated_kwh: Math.round(estimatedKwh * 10000) / 10000,
      estimated_cost: Math.round(estimatedKwh * 0.56 * 100) / 100
    };
  }

  _isPowerOnEvent(event) {
    try {
      const data = typeof event.event_data === 'string' ? JSON.parse(event.event_data) : event.event_data;
      if (event.event_type === 'power_on') return true;
      if (data.action === 'power_on') return true;
      if (data.params && data.params.power === 'on') return true;
      if (data.power === 'on') return true;
      return false;
    } catch {
      return false;
    }
  }

  _isPowerOffEvent(event) {
    try {
      const data = typeof event.event_data === 'string' ? JSON.parse(event.event_data) : event.event_data;
      if (event.event_type === 'power_off') return true;
      if (data.action === 'power_off') return true;
      if (data.params && data.params.power === 'off') return true;
      if (data.power === 'off') return true;
      return false;
    } catch {
      return false;
    }
  }
}

module.exports = new DeviceEvent();
