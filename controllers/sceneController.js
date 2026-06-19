const Scene = require('../models/Scene');
const Device = require('../models/Device');
const Response = require('../utils/response');
const { parseState, stringifyState, delay, parseActionParams } = require('../utils/helpers');
const { getWSManager } = require('../websocket/manager');

class SceneController {
  static async list(req, res) {
    const scenes = Scene.findByUserId(req.user.id);
    return Response.success(res, scenes);
  }

  static async create(req, res) {
    const { name, icon, description } = req.body;

    if (!name) {
      return Response.error(res, '场景名称不能为空', 400);
    }

    const scene = Scene.create({
      user_id: req.user.id,
      name,
      icon: icon || null,
      description: description || null,
      is_enabled: 1
    });

    return Response.success(res, scene, '场景创建成功', 201);
  }

  static async detail(req, res) {
    const scene = Scene.getFullScene(req.params.id);

    if (!scene || scene.user_id !== req.user.id) {
      return Response.error(res, '场景不存在或无权访问', 404);
    }

    scene.actions = scene.actions.map(a => ({
      ...a,
      action_params: parseActionParams(a.action_params)
    }));

    return Response.success(res, scene);
  }

  static async update(req, res) {
    const { name, icon, description, is_enabled } = req.body;
    const scene = Scene.findById(req.params.id);

    if (!scene || scene.user_id !== req.user.id) {
      return Response.error(res, '场景不存在或无权访问', 404);
    }

    if (!name) {
      return Response.error(res, '场景名称不能为空', 400);
    }

    const updateData = { name, icon: icon || null, description: description || null };
    if (is_enabled !== undefined) {
      updateData.is_enabled = is_enabled ? 1 : 0;
    }

    const updated = Scene.update(scene.id, updateData);
    return Response.success(res, updated, '场景更新成功');
  }

  static async remove(req, res) {
    const scene = Scene.findById(req.params.id);

    if (!scene || scene.user_id !== req.user.id) {
      return Response.error(res, '场景不存在或无权访问', 404);
    }

    Scene.delete(scene.id);
    return Response.success(res, null, '场景删除成功');
  }

  static async addAction(req, res) {
    const { scene_id } = req.params;
    const { device_id, action_order, action_type, action_params = {}, delay_ms = 0 } = req.body;

    const scene = Scene.findById(scene_id);
    if (!scene || scene.user_id !== req.user.id) {
      return Response.error(res, '场景不存在或无权访问', 404);
    }

    const device = Device.findById(device_id);
    if (!device || device.user_id !== req.user.id) {
      return Response.error(res, '设备不存在或无权访问', 400);
    }

    const validTypes = ['power_on', 'power_off', 'toggle', 'set_state'];
    if (!validTypes.includes(action_type)) {
      return Response.error(res, `动作类型无效，支持: ${validTypes.join(', ')}`, 400);
    }

    const action = Scene.addAction(scene_id, {
      device_id,
      action_order: action_order || 1,
      action_type,
      action_params: typeof action_params === 'string' ? action_params : JSON.stringify(action_params),
      delay_ms: parseInt(delay_ms) || 0
    });

    return Response.success(res, {
      ...action,
      action_params: parseActionParams(action.action_params)
    }, '动作添加成功', 201);
  }

  static async updateAction(req, res) {
    const { action_id } = req.params;
    const { action_order, action_type, action_params, delay_ms } = req.body;

    const info = Scene._findActionWithUser(action_id);

    if (!info || info.user_id !== req.user.id) {
      return Response.error(res, '动作不存在或无权访问', 404);
    }

    const updateData = {};
    if (action_order !== undefined) updateData.action_order = action_order;
    if (action_type !== undefined) {
      const validTypes = ['power_on', 'power_off', 'toggle', 'set_state'];
      if (!validTypes.includes(action_type)) {
        return Response.error(res, `动作类型无效，支持: ${validTypes.join(', ')}`, 400);
      }
      updateData.action_type = action_type;
    }
    if (action_params !== undefined) {
      updateData.action_params = typeof action_params === 'string' ? action_params : JSON.stringify(action_params);
    }
    if (delay_ms !== undefined) updateData.delay_ms = parseInt(delay_ms) || 0;

    const updated = Scene.updateAction(action_id, updateData);
    return Response.success(res, {
      ...updated,
      action_params: parseActionParams(updated.action_params)
    }, '动作更新成功');
  }

  static async removeAction(req, res) {
    const { action_id } = req.params;
    const info = Scene._findActionWithUser(action_id);

    if (!info || info.user_id !== req.user.id) {
      return Response.error(res, '动作不存在或无权访问', 404);
    }

    Scene.deleteAction(action_id);
    return Response.success(res, null, '动作删除成功');
  }

  static async execute(req, res) {
    const scene = Scene.getFullScene(req.params.id);

    if (!scene || scene.user_id !== req.user.id) {
      return Response.error(res, '场景不存在或无权访问', 404);
    }

    if (!scene.is_enabled) {
      return Response.error(res, '场景已被禁用', 400);
    }

    const wsManager = getWSManager();
    wsManager.broadcastSceneExecute(scene.id, req.user.id, 'started', {
      scene_name: scene.name,
      action_count: scene.actions.length
    });

    const executionResults = [];

    (async () => {
      const sortedActions = [...scene.actions].sort((a, b) => a.action_order - b.action_order);
      let index = 0;

      for (const action of sortedActions) {
        index++;
        try {
          if (action.delay_ms && action.delay_ms > 0) {
            await delay(action.delay_ms);
          }

          const device = Device.findById(action.device_id);
          if (!device) {
            executionResults.push({
              action_id: action.id,
              device_id: action.device_id,
              device_name: action.device_name,
              status: 'failed',
              error: '设备不存在'
            });
            wsManager.broadcastSceneExecute(scene.id, req.user.id, 'action_complete', {
              action_index: index,
              action_total: sortedActions.length,
              action_id: action.id,
              status: 'failed',
              error: '设备不存在'
            });
            continue;
          }

          const currentState = parseState(device.state);
          const newState = { ...currentState };
          const params = parseActionParams(action.action_params);

          switch (action.action_type) {
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
          }

          const status = newState.power === 'on' ? 'active' : 'standby';
          const updated = Device.updateState(device.id, stringifyState(newState));
          Device.update(device.id, { status });

          wsManager.broadcastDeviceState(updated, req.user.id, 'scene_control');
          wsManager.broadcastSceneExecute(scene.id, req.user.id, 'action_complete', {
            action_index: index,
            action_total: sortedActions.length,
            action_id: action.id,
            device_id: device.id,
            device_name: action.device_name,
            status: 'success',
            state: newState
          });

          executionResults.push({
            action_id: action.id,
            device_id: device.id,
            device_name: action.device_name,
            status: 'success',
            state: newState
          });
        } catch (err) {
          executionResults.push({
            action_id: action.id,
            device_id: action.device_id,
            device_name: action.device_name,
            status: 'failed',
            error: err.message
          });
          wsManager.broadcastSceneExecute(scene.id, req.user.id, 'action_complete', {
            action_index: index,
            action_total: sortedActions.length,
            action_id: action.id,
            status: 'failed',
            error: err.message
          });
        }
      }

      const successCount = executionResults.filter(r => r.status === 'success').length;
      wsManager.broadcastSceneExecute(scene.id, req.user.id, 'completed', {
        scene_name: scene.name,
        action_total: sortedActions.length,
        success_count: successCount,
        failed_count: sortedActions.length - successCount,
        results: executionResults
      });
    })();

    return Response.success(res, {
      scene_id: scene.id,
      scene_name: scene.name,
      action_count: scene.actions.length,
      message: '场景已开始顺序执行，结果将通过WebSocket推送'
    }, '场景执行中');
  }
}

module.exports = SceneController;
