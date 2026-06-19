const Room = require('../models/Room');
const Device = require('../models/Device');
const Response = require('../utils/response');

class RoomController {
  static async list(req, res) {
    const rooms = Room.findByUserId(req.user.id);
    return Response.success(res, rooms);
  }

  static async create(req, res) {
    const { name, icon } = req.body;

    if (!name) {
      return Response.error(res, '房间名称不能为空', 400);
    }

    const room = Room.create({
      user_id: req.user.id,
      name,
      icon: icon || null
    });

    return Response.success(res, room, '房间创建成功', 201);
  }

  static async detail(req, res) {
    const room = Room.findById(req.params.id);

    if (!room || room.user_id !== req.user.id) {
      return Response.error(res, '房间不存在或无权访问', 404);
    }

    const devices = Device.findByUserId(req.user.id, { room_id: room.id }).map(d => ({
      ...d,
      state: typeof d.state === 'string' ? JSON.parse(d.state || '{}') : d.state || {},
      is_online: !!d.is_online
    }));

    return Response.success(res, { ...room, devices });
  }

  static async update(req, res) {
    const { name, icon } = req.body;
    const room = Room.findById(req.params.id);

    if (!room || room.user_id !== req.user.id) {
      return Response.error(res, '房间不存在或无权访问', 404);
    }

    if (!name) {
      return Response.error(res, '房间名称不能为空', 400);
    }

    const updated = Room.update(room.id, { name, icon: icon || null });
    return Response.success(res, updated, '房间更新成功');
  }

  static async remove(req, res) {
    const room = Room.findById(req.params.id);

    if (!room || room.user_id !== req.user.id) {
      return Response.error(res, '房间不存在或无权访问', 404);
    }

    const devices = Device.findByUserId(req.user.id, { room_id: room.id });
    devices.forEach(d => {
      Device.update(d.id, { room_id: null });
    });

    Room.delete(room.id);
    return Response.success(res, null, '房间删除成功');
  }
}

module.exports = RoomController;
