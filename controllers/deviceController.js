const Device = require('../models/Device');
const Room = require('../models/Room');
const Message = require('../models/Message');
const Response = require('../utils/response');
const { parseState, stringifyState, generateSerialNumber } = require('../utils/helpers');
const { getWSManager } = require('../websocket/manager');

class DeviceController {
  static async list(req, res) {
    const { room_id, type, status } = req.query;
    const filters = {};
    if (room_id) filters.room_id = room_id;
    if (type) filters.type = type;
    if (status) filters.status = status;

    const devices = Device.findByUserId(req.user.id, filters).map(d => ({
      ...d,
      state: parseState(d.state),
      is_online: !!d.is_online
    }));

    return Response.success(res, devices);
  }

  static async create(req, res) {
    const { name, type, manufacturer, model, room_id, firmware_version } = req.body;

    if (!name || !type) {
      return Response.error(res, '设备名称和类型不能为空', 400);
    }

    if (room_id) {
      const room = Room.findById(room_id);
      if (!room || room.user_id !== req.user.id) {
        return Response.error(res, '房间不存在或无权访问', 400);
      }
    }

    const validTypes = ['light', 'switch', 'ac', 'thermostat', 'camera', 'speaker', 'curtain', 'lock', 'tv', 'sensor', 'other'];
    if (!validTypes.includes(type)) {
      return Response.error(res, `设备类型无效，支持的类型: ${validTypes.join(', ')}`, 400);
    }

    const device = Device.create({
      user_id: req.user.id,
      room_id: room_id || null,
      name,
      type,
      manufacturer: manufacturer || null,
      model: model || null,
      serial_number: generateSerialNumber(),
      status: 'offline',
      state: stringifyState({ power: 'off' }),
      firmware_version: firmware_version || '1.0.0',
      is_online: 0
    });

    try {
      Message.create({
        user_id: req.user.id,
        type: 'system',
        title: '新设备添加',
        content: `您已成功添加设备: ${name} (${type})`,
        related_type: 'device',
        related_id: device.id
      });
    } catch {}

    return Response.success(res, {
      ...device,
      state: parseState(device.state),
      is_online: !!device.is_online
    }, '设备添加成功', 201);
  }

  static async detail(req, res) {
    const device = Device.findById(req.params.id);

    if (!device || device.user_id !== req.user.id) {
      return Response.error(res, '设备不存在或无权访问', 404);
    }

    return Response.success(res, {
      ...device,
      state: parseState(device.state),
      is_online: !!device.is_online
    });
  }

  static async update(req, res) {
    const { name, room_id } = req.body;
    const device = Device.findById(req.params.id);

    if (!device || device.user_id !== req.user.id) {
      return Response.error(res, '设备不存在或无权访问', 404);
    }

    if (room_id) {
      const room = Room.findById(room_id);
      if (!room || room.user_id !== req.user.id) {
        return Response.error(res, '房间不存在或无权访问', 400);
      }
    }

    const updateData = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (room_id !== undefined) updateData.room_id = room_id || null;

    const updated = Device.update(device.id, updateData);

    const wsManager = getWSManager();
    wsManager.broadcastDeviceState(updated, req.user.id, 'update');

    return Response.success(res, {
      ...updated,
      state: parseState(updated.state),
      is_online: !!updated.is_online
    }, '设备更新成功');
  }

  static async remove(req, res) {
    const device = Device.findById(req.params.id);

    if (!device || device.user_id !== req.user.id) {
      return Response.error(res, '设备不存在或无权访问', 404);
    }

    Device.delete(device.id);

    const wsManager = getWSManager();
    wsManager.broadcastDeviceState({ ...device, state: '{}' }, req.user.id, 'delete');

    return Response.success(res, null, '设备删除成功');
  }

  static async control(req, res) {
    const { action, params = {} } = req.body;
    const device = Device.findById(req.params.id);

    if (!device || device.user_id !== req.user.id) {
      return Response.error(res, '设备不存在或无权访问', 404);
    }

    const currentState = parseState(device.state);
    const newState = { ...currentState };

    switch (action) {
      case 'power_on':
        newState.power = 'on';
        break;
      case 'power_off':
        newState.power = 'off';
        break;
      case 'toggle':
        newState.power = currentState.power === 'on' ? 'off' : 'on';
        break;
      case 'set_state':
        Object.assign(newState, params);
        break;
      default:
        return Response.error(res, `不支持的操作: ${action}`, 400);
    }

    const updated = Device.updateState(device.id, stringifyState(newState));
    updated.status = newState.power === 'on' ? 'active' : 'standby';
    Device.update(device.id, { status: updated.status, updated_at: new Date().toISOString() });

    const wsManager = getWSManager();
    wsManager.broadcastDeviceState(updated, req.user.id, 'control');

    return Response.success(res, {
      ...updated,
      state: newState,
      is_online: !!updated.is_online
    }, '设备控制成功');
  }

  static async setOnline(req, res) {
    const { online } = req.body;
    const device = Device.findById(req.params.id);

    if (!device || device.user_id !== req.user.id) {
      return Response.error(res, '设备不存在或无权访问', 404);
    }

    const isOnline = online === true || online === 1 || online === '1' || online === 'true';
    const status = isOnline ? (parseState(device.state).power === 'on' ? 'active' : 'standby') : 'offline';

    const updated = Device.updateOnlineStatus(device.id, isOnline, status);

    const wsManager = getWSManager();
    wsManager.broadcastDeviceState(updated, req.user.id, 'online');

    return Response.success(res, {
      ...updated,
      state: parseState(updated.state),
      is_online: !!updated.is_online
    }, '设备在线状态更新成功');
  }

  static async batchControl(req, res) {
    const { device_ids, action, params = {} } = req.body;

    if (!Array.isArray(device_ids) || device_ids.length === 0) {
      return Response.error(res, '设备ID列表不能为空', 400);
    }

    const results = [];
    const errors = [];
    const wsManager = getWSManager();

    for (const deviceId of device_ids) {
      try {
        const device = Device.findById(deviceId);
        if (!device || device.user_id !== req.user.id) {
          errors.push({ id: deviceId, error: '设备不存在或无权访问' });
          continue;
        }

        const currentState = parseState(device.state);
        const newState = { ...currentState };

        switch (action) {
          case 'power_on':
            newState.power = 'on';
            break;
          case 'power_off':
            newState.power = 'off';
            break;
          case 'toggle':
            newState.power = currentState.power === 'on' ? 'off' : 'on';
            break;
          case 'set_state':
            Object.assign(newState, params);
            break;
          default:
            errors.push({ id: deviceId, error: `不支持的操作: ${action}` });
            continue;
        }

        const status = newState.power === 'on' ? 'active' : 'standby';
        const updated = Device.updateState(device.id, stringifyState(newState));
        Device.update(device.id, { status, updated_at: new Date().toISOString() });

        wsManager.broadcastDeviceState(updated, req.user.id, 'control');
        results.push({ id: deviceId, success: true, state: newState });
      } catch (err) {
        errors.push({ id: deviceId, error: err.message });
      }
    }

    return Response.success(res, {
      success: results,
      failed: errors,
      total_count: device_ids.length,
      success_count: results.length,
      failed_count: errors.length
    }, '批量控制完成');
  }
}

module.exports = DeviceController;
