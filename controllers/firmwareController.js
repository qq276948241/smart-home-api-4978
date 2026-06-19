const FirmwareVersion = require('../models/FirmwareVersion');
const Device = require('../models/Device');
const Response = require('../utils/response');
const { getWSManager } = require('../websocket/manager');
const MessageController = require('./MessageController');

class FirmwareController {
  static async listVersions(req, res) {
    const { device_type } = req.query;
    const filters = { is_published: 1 };
    if (device_type) filters.device_type = device_type;

    const versions = FirmwareVersion.findAll(filters, 'created_at DESC');
    return Response.success(res, versions);
  }

  static async getLatest(req, res) {
    const { device_type } = req.query;
    if (!device_type) {
      return Response.error(res, '设备类型不能为空', 400);
    }

    const latest = FirmwareVersion.findLatest(device_type);
    if (!latest) {
      return Response.error(res, '未找到可用的固件版本', 404);
    }
    return Response.success(res, latest);
  }

  static async createVersion(req, res) {
    const { device_type, version, filename, file_size, md5, release_notes, is_mandatory } = req.body;

    if (!device_type || !version) {
      return Response.error(res, '设备类型和版本号不能为空', 400);
    }

    const fw = FirmwareVersion.create({
      device_type,
      version,
      filename: filename || null,
      file_size: file_size || null,
      md5: md5 || null,
      release_notes: release_notes || null,
      is_mandatory: is_mandatory ? 1 : 0,
      is_published: 1
    });

    return Response.success(res, fw, '固件版本创建成功', 201);
  }

  static async updateVersion(req, res) {
    const { release_notes, is_mandatory, is_published } = req.body;
    const fw = FirmwareVersion.findById(req.params.id);

    if (!fw) {
      return Response.error(res, '固件版本不存在', 404);
    }

    const updateData = {};
    if (release_notes !== undefined) updateData.release_notes = release_notes;
    if (is_mandatory !== undefined) updateData.is_mandatory = is_mandatory ? 1 : 0;
    if (is_published !== undefined) updateData.is_published = is_published ? 1 : 0;

    const updated = FirmwareVersion.update(fw.id, updateData);
    return Response.success(res, updated, '固件版本更新成功');
  }

  static async deleteVersion(req, res) {
    const fw = FirmwareVersion.findById(req.params.id);
    if (!fw) {
      return Response.error(res, '固件版本不存在', 404);
    }
    FirmwareVersion.delete(fw.id);
    return Response.success(res, null, '固件版本删除成功');
  }

  static async checkDeviceUpdate(req, res) {
    const device = Device.findById(req.params.device_id);

    if (!device || device.user_id !== req.user.id) {
      return Response.error(res, '设备不存在或无权访问', 404);
    }

    const latest = FirmwareVersion.findLatest(device.type);
    const hasUpdate = latest && latest.version !== device.firmware_version;

    return Response.success(res, {
      device_id: device.id,
      device_name: device.name,
      current_version: device.firmware_version,
      has_update: hasUpdate,
      latest: hasUpdate ? {
        id: latest.id,
        version: latest.version,
        release_notes: latest.release_notes,
        is_mandatory: !!latest.is_mandatory,
        file_size: latest.file_size,
        md5: latest.md5
      } : null
    });
  }

  static async startUpgrade(req, res) {
    const device = Device.findById(req.params.device_id);

    if (!device || device.user_id !== req.user.id) {
      return Response.error(res, '设备不存在或无权访问', 404);
    }

    if (!device.is_online) {
      return Response.error(res, '设备离线，无法进行固件升级', 400);
    }

    const { firmware_id } = req.body;
    const fw = firmware_id ? FirmwareVersion.findById(firmware_id) : FirmwareVersion.findLatest(device.type);

    if (!fw) {
      return Response.error(res, '固件版本不存在', 404);
    }

    if (fw.device_type !== device.type) {
      return Response.error(res, '固件类型与设备不匹配', 400);
    }

    if (fw.version === device.firmware_version) {
      return Response.error(res, '设备已是最新版本', 400);
    }

    const history = FirmwareVersion.createUpgradeHistory(device.id, fw.id);

    const wsManager = getWSManager();
    wsManager.broadcastFirmwareUpdate(device.id, req.user.id, 'started', 0);

    this.simulateUpgrade(device, fw, history, req.user.id);

    await MessageController.push(req.user.id, {
      type: 'system',
      title: '固件升级开始',
      content: `设备「${device.name}」开始升级到 v${fw.version}`,
      related_type: 'device',
      related_id: device.id
    });

    return Response.success(res, {
      device_id: device.id,
      firmware_version: fw.version,
      history_id: history.id,
      status: 'upgrading',
      message: '固件升级已开始，进度将通过WebSocket推送'
    }, '固件升级已启动');
  }

  static simulateUpgrade(device, fw, history, userId) {
    const wsManager = getWSManager();
    const totalSteps = 10;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      const progress = Math.round((step / totalSteps) * 100);
      wsManager.broadcastFirmwareUpdate(device.id, userId, 'downloading', progress);

      if (step >= totalSteps) {
        clearInterval(interval);

        setTimeout(() => {
          try {
            Device.update(device.id, {
              firmware_version: fw.version,
              updated_at: new Date().toISOString()
            });
            FirmwareVersion.updateUpgradeStatus(history.id, 'completed');
            wsManager.broadcastFirmwareUpdate(device.id, userId, 'completed', 100);

            const updatedDevice = Device.findById(device.id);
            wsManager.broadcastDeviceState(updatedDevice, userId, 'firmware');

            MessageController.push(userId, {
              type: 'success',
              title: '固件升级完成',
              content: `设备「${device.name}」已成功升级到 v${fw.version}`,
              related_type: 'device',
              related_id: device.id
            });
          } catch (err) {
            FirmwareVersion.updateUpgradeStatus(history.id, 'failed', err.message);
            wsManager.broadcastFirmwareUpdate(device.id, userId, 'failed', 0);
            MessageController.push(userId, {
              type: 'error',
              title: '固件升级失败',
              content: `设备「${device.name}」升级失败: ${err.message}`,
              related_type: 'device',
              related_id: device.id
            });
          }
        }, 500);
      }
    }, 800);
  }

  static async getUpgradeHistory(req, res) {
    const device = Device.findById(req.params.device_id);

    if (!device || device.user_id !== req.user.id) {
      return Response.error(res, '设备不存在或无权访问', 404);
    }

    const history = FirmwareVersion.getUpgradeHistory(device.id);
    return Response.success(res, history);
  }
}

module.exports = FirmwareController;
