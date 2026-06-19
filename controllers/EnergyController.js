const Device = require('../models/Device');
const Room = require('../models/Room');
const DeviceEvent = require('../models/DeviceEvent');
const Response = require('../utils/response');
const { getDevicePower, getPowerConfig } = require('../config/database');

class EnergyController {
  static parseTimeRange(req) {
    const { start_time, end_time, period } = req.query;
    let startTime, endTime;

    if (start_time) {
      startTime = new Date(start_time).toISOString();
    } else {
      const d = new Date();
      if (period === 'week') {
        d.setDate(d.getDate() - 7);
      } else if (period === 'month') {
        d.setMonth(d.getMonth() - 1);
      } else {
        d.setDate(d.getDate() - 1);
      }
      startTime = d.toISOString();
    }

    endTime = end_time ? new Date(end_time).toISOString() : new Date().toISOString();

    return { startTime, endTime };
  }

  static async getRoomStats(req, res) {
    const { sort_by = 'energy', order = 'desc' } = req.query;
    const { startTime, endTime } = this.parseTimeRange(req);

    const rooms = Room.findByUserId(req.user.id);
    const allDevices = Device.findByUserId(req.user.id);
    const roomDeviceMap = {};

    rooms.forEach(room => {
      roomDeviceMap[room.id] = allDevices.filter(d => d.room_id === room.id);
    });

    const noRoomDevices = allDevices.filter(d => !d.room_id);
    if (noRoomDevices.length > 0) {
      rooms.push({
        id: 0,
        name: '未分组设备',
        user_id: req.user.id,
        icon: null,
        device_count: noRoomDevices.length
      });
      roomDeviceMap[0] = noRoomDevices;
    }

    const results = [];
    let totalKwh = 0;
    let totalMinutes = 0;
    let totalSwitchCount = 0;
    let totalDeviceCount = 0;

    for (const room of rooms) {
      const devices = roomDeviceMap[room.id] || [];
      let roomKwh = 0;
      let roomMinutes = 0;
      let roomSwitchCount = 0;
      const deviceStats = [];

      for (const device of devices) {
        const stats = DeviceEvent.calculateDeviceStats(device.id, startTime, endTime);
        roomKwh += stats.estimated_kwh || 0;
        roomMinutes += stats.on_duration_minutes || 0;
        roomSwitchCount += stats.on_off_count || 0;

        deviceStats.push({
          device_id: device.id,
          device_name: device.name,
          device_type: device.type,
          power_watts: stats.power_watts,
          on_off_count: stats.on_off_count,
          on_duration_hours: stats.on_duration_hours,
          estimated_kwh: stats.estimated_kwh,
          estimated_cost: stats.estimated_cost
        });
      }

      const avgPower = devices.length > 0
        ? Math.round(devices.reduce((s, d) => s + getDevicePower(d.type), 0) / devices.length)
        : 0;

      results.push({
        room_id: room.id,
        room_name: room.name,
        device_count: devices.length,
        on_off_count: roomSwitchCount,
        on_duration_hours: Math.round(roomMinutes / 60 * 100) / 100,
        on_duration_minutes: Math.round(roomMinutes * 100) / 100,
        avg_power_watts: avgPower,
        estimated_kwh: Math.round(roomKwh * 10000) / 10000,
        estimated_cost: Math.round(roomKwh * 0.56 * 100) / 100,
        devices: deviceStats.sort((a, b) => b.estimated_kwh - a.estimated_kwh)
      });

      totalKwh += roomKwh;
      totalMinutes += roomMinutes;
      totalSwitchCount += roomSwitchCount;
      totalDeviceCount += devices.length;
    }

    results.sort((a, b) => {
      let av = a, bv = b;
      if (sort_by === 'energy') { av = a.estimated_kwh; bv = b.estimated_kwh; }
      else if (sort_by === 'duration') { av = a.on_duration_minutes; bv = b.on_duration_minutes; }
      else if (sort_by === 'switch_count') { av = a.on_off_count; bv = b.on_off_count; }
      else if (sort_by === 'device_count') { av = a.device_count; bv = b.device_count; }
      else if (sort_by === 'cost') { av = a.estimated_cost; bv = b.estimated_cost; }
      return order === 'asc' ? av - bv : bv - av;
    });

    results.forEach((r, idx) => {
      r.rank = idx + 1;
    });

    return Response.success(res, {
      period: { start: startTime, end: endTime },
      summary: {
        total_rooms: results.length,
        total_devices: totalDeviceCount,
        total_on_off_count: totalSwitchCount,
        total_on_duration_hours: Math.round(totalMinutes / 60 * 100) / 100,
        total_estimated_kwh: Math.round(totalKwh * 10000) / 10000,
        total_estimated_cost: Math.round(totalKwh * 0.56 * 100) / 100,
        avg_cost_per_room: results.length > 0 ? Math.round(totalKwh * 0.56 / results.length * 100) / 100 : 0
      },
      sort: { by: sort_by, order: order },
      rooms: results
    });
  }

  static async getDeviceStats(req, res) {
    const { startTime, endTime } = this.parseTimeRange(req);
    const device = Device.findById(req.params.device_id);

    if (!device || device.user_id !== req.user.id) {
      return Response.error(res, '设备不存在或无权访问', 404);
    }

    const stats = DeviceEvent.calculateDeviceStats(device.id, startTime, endTime);
    const events = DeviceEvent.findByDeviceId(device.id, startTime, endTime).map(e => ({
      ...e,
      event_data: typeof e.event_data === 'string' ? JSON.parse(e.event_data || '{}') : e.event_data
    }));

    return Response.success(res, {
      period: { start: startTime, end: endTime },
      device: {
        id: device.id,
        name: device.name,
        type: device.type,
        power_watts: getDevicePower(device.type)
      },
      stats: {
        on_off_count: stats.on_off_count,
        on_duration_hours: stats.on_duration_hours,
        on_duration_minutes: stats.on_duration_minutes,
        power_watts: stats.power_watts,
        estimated_kwh: stats.estimated_kwh,
        estimated_cost: stats.estimated_cost,
        cost_per_hour: Math.round(stats.power_watts * 0.56 / 1000 * 10000) / 10000
      },
      events_count: events.length,
      recent_events: events.slice(-20).reverse()
    });
  }

  static async getPowerConfig(req, res) {
    return Response.success(res, {
      unit_price: 0.56,
      currency: 'CNY',
      power_watts_per_type: getPowerConfig()
    });
  }

  static async getOverallStats(req, res) {
    const { startTime, endTime } = this.parseTimeRange(req);
    const devices = Device.findByUserId(req.user.id);

    let totalKwh = 0;
    let totalMinutes = 0;
    let totalSwitchCount = 0;
    let onlineCount = 0;
    let activeCount = 0;
    const typeStats = {};

    for (const device of devices) {
      if (device.is_online) onlineCount++;
      const state = typeof device.state === 'string' ? JSON.parse(device.state || '{}') : device.state || {};
      if (state.power === 'on') activeCount++;

      const stats = DeviceEvent.calculateDeviceStats(device.id, startTime, endTime);
      totalKwh += stats.estimated_kwh || 0;
      totalMinutes += stats.on_duration_minutes || 0;
      totalSwitchCount += stats.on_off_count || 0;

      if (!typeStats[device.type]) {
        typeStats[device.type] = {
          type: device.type,
          count: 0,
          estimated_kwh: 0,
          power_watts: getDevicePower(device.type)
        };
      }
      typeStats[device.type].count++;
      typeStats[device.type].estimated_kwh += stats.estimated_kwh || 0;
    }

    const typeRanking = Object.values(typeStats)
      .sort((a, b) => b.estimated_kwh - a.estimated_kwh)
      .map((t, i) => ({ ...t, rank: i + 1, estimated_kwh: Math.round(t.estimated_kwh * 10000) / 10000 }));

    const hours = totalMinutes / 60;
    const costPerDay = hours > 0 ? (totalKwh * 0.56 / Math.max((new Date(endTime) - new Date(startTime)) / (1000 * 60 * 60 * 24), 1)) : 0;

    return Response.success(res, {
      period: { start: startTime, end: endTime },
      overview: {
        total_devices: devices.length,
        online_devices: onlineCount,
        active_devices: activeCount,
        offline_devices: devices.length - onlineCount
      },
      energy: {
        total_on_off_count: totalSwitchCount,
        total_on_duration_hours: Math.round(hours * 100) / 100,
        total_estimated_kwh: Math.round(totalKwh * 10000) / 10000,
        total_estimated_cost: Math.round(totalKwh * 0.56 * 100) / 100,
        estimated_cost_per_day: Math.round(costPerDay * 100) / 100,
        estimated_cost_per_month: Math.round(costPerDay * 30 * 100) / 100
      },
      type_ranking: typeRanking
    });
  }
}

module.exports = EnergyController;
