const Schedule = require('../models/Schedule');
const Scene = require('../models/Scene');
const Device = require('../models/Device');
const Response = require('../utils/response');
const { parseState, stringifyState, parseActionParams } = require('../utils/helpers');
const { getWSManager } = require('../websocket/manager');
const cron = require('node-cron');

const activeTasks = new Map();

class ScheduleController {
  static validateCronExpression(expr) {
    try {
      return cron.validate(expr);
    } catch {
      return false;
    }
  }

  static async list(req, res) {
    const schedules = Schedule.findByUserId(req.user.id).map(s => ({
      ...s,
      is_enabled: !!s.is_enabled,
      action_params: parseActionParams(s.action_params)
    }));
    return Response.success(res, schedules);
  }

  static async create(req, res) {
    const { name, cron_expression, type, target_id, action_params = {} } = req.body;

    if (!name || !cron_expression || !type) {
      return Response.error(res, '名称、Cron表达式和类型不能为空', 400);
    }

    const validTypes = ['scene', 'device'];
    if (!validTypes.includes(type)) {
      return Response.error(res, `类型无效，支持: ${validTypes.join(', ')}`, 400);
    }

    if (!this.validateCronExpression(cron_expression)) {
      return Response.error(res, 'Cron表达式格式无效', 400);
    }

    if (type === 'scene') {
      if (!target_id) return Response.error(res, '场景ID不能为空', 400);
      const scene = Scene.findById(target_id);
      if (!scene || scene.user_id !== req.user.id) {
        return Response.error(res, '场景不存在或无权访问', 400);
      }
    } else if (type === 'device') {
      if (!target_id) return Response.error(res, '设备ID不能为空', 400);
      const device = Device.findById(target_id);
      if (!device || device.user_id !== req.user.id) {
        return Response.error(res, '设备不存在或无权访问', 400);
      }
      if (!action_params || !action_params.action) {
        return Response.error(res, '设备操作参数不能为空', 400);
      }
    }

    const schedule = Schedule.create({
      user_id: req.user.id,
      name,
      cron_expression,
      type,
      target_id,
      action_params: typeof action_params === 'string' ? action_params : JSON.stringify(action_params),
      is_enabled: 1
    });

    if (schedule.is_enabled) {
      this.scheduleTask(schedule);
    }

    return Response.success(res, {
      ...schedule,
      is_enabled: !!schedule.is_enabled,
      action_params: parseActionParams(schedule.action_params)
    }, '定时任务创建成功', 201);
  }

  static async detail(req, res) {
    const schedule = Schedule.findById(req.params.id);

    if (!schedule || schedule.user_id !== req.user.id) {
      return Response.error(res, '定时任务不存在或无权访问', 404);
    }

    return Response.success(res, {
      ...schedule,
      is_enabled: !!schedule.is_enabled,
      action_params: parseActionParams(schedule.action_params)
    });
  }

  static async update(req, res) {
    const { name, cron_expression, type, target_id, action_params, is_enabled } = req.body;
    const schedule = Schedule.findById(req.params.id);

    if (!schedule || schedule.user_id !== req.user.id) {
      return Response.error(res, '定时任务不存在或无权访问', 404);
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;

    if (cron_expression !== undefined) {
      if (!this.validateCronExpression(cron_expression)) {
        return Response.error(res, 'Cron表达式格式无效', 400);
      }
      updateData.cron_expression = cron_expression;
    }

    if (type !== undefined) {
      const validTypes = ['scene', 'device'];
      if (!validTypes.includes(type)) {
        return Response.error(res, `类型无效，支持: ${validTypes.join(', ')}`, 400);
      }
      updateData.type = type;
    }

    if (target_id !== undefined) updateData.target_id = target_id;
    if (action_params !== undefined) {
      updateData.action_params = typeof action_params === 'string' ? action_params : JSON.stringify(action_params);
    }
    if (is_enabled !== undefined) updateData.is_enabled = is_enabled ? 1 : 0;

    const updated = Schedule.update(schedule.id, updateData);

    if (activeTasks.has(schedule.id)) {
      const task = activeTasks.get(schedule.id);
      task.stop();
      activeTasks.delete(schedule.id);
    }
    if (updated.is_enabled) {
      this.scheduleTask(updated);
    }

    return Response.success(res, {
      ...updated,
      is_enabled: !!updated.is_enabled,
      action_params: parseActionParams(updated.action_params)
    }, '定时任务更新成功');
  }

  static async toggle(req, res) {
    const { enabled } = req.body;
    const schedule = Schedule.findById(req.params.id);

    if (!schedule || schedule.user_id !== req.user.id) {
      return Response.error(res, '定时任务不存在或无权访问', 404);
    }

    const isEnabled = enabled === true || enabled === 1 || enabled === '1' || enabled === 'true';
    const updated = Schedule.update(schedule.id, { is_enabled: isEnabled ? 1 : 0 });

    if (activeTasks.has(schedule.id)) {
      const task = activeTasks.get(schedule.id);
      task.stop();
      activeTasks.delete(schedule.id);
    }
    if (isEnabled) {
      this.scheduleTask(updated);
    }

    return Response.success(res, {
      ...updated,
      is_enabled: !!updated.is_enabled
    }, `定时任务已${isEnabled ? '启用' : '禁用'}`);
  }

  static async remove(req, res) {
    const schedule = Schedule.findById(req.params.id);

    if (!schedule || schedule.user_id !== req.user.id) {
      return Response.error(res, '定时任务不存在或无权访问', 404);
    }

    if (activeTasks.has(schedule.id)) {
      const task = activeTasks.get(schedule.id);
      task.stop();
      activeTasks.delete(schedule.id);
    }

    Schedule.delete(schedule.id);
    return Response.success(res, null, '定时任务删除成功');
  }

  static scheduleTask(schedule) {
    try {
      const params = parseActionParams(schedule.action_params);
      const task = cron.schedule(schedule.cron_expression, async () => {
        const wsManager = getWSManager();
        wsManager.broadcastScheduleExecute(schedule.id, schedule.user_id, 'triggered', {
          schedule_name: schedule.name,
          type: schedule.type
        });

        try {
          if (schedule.type === 'scene') {
            const scene = Scene.getFullScene(schedule.target_id);
            if (scene && scene.is_enabled) {
              const sortedActions = [...scene.actions].sort((a, b) => a.action_order - b.action_order);
              for (const action of sortedActions) {
                if (action.delay_ms && action.delay_ms > 0) {
                  await new Promise(r => setTimeout(r, action.delay_ms));
                }
                const device = Device.findById(action.device_id);
                if (device) {
                  const currentState = parseState(device.state);
                  const newState = { ...currentState };
                  const actionParams = parseActionParams(action.action_params);

                  switch (action.action_type) {
                    case 'power_on': newState.power = 'on'; break;
                    case 'power_off': newState.power = 'off'; break;
                    case 'toggle': newState.power = currentState.power === 'on' ? 'off' : 'on'; break;
                    case 'set_state': Object.assign(newState, actionParams); break;
                  }

                  const status = newState.power === 'on' ? 'active' : 'standby';
                  const updated = Device.updateState(device.id, stringifyState(newState));
                  Device.update(device.id, { status, updated_at: new Date().toISOString() });
                  wsManager.broadcastDeviceState(updated, schedule.user_id, 'schedule_control');
                }
              }
            }
          } else if (schedule.type === 'device') {
            const device = Device.findById(schedule.target_id);
            if (device) {
              const currentState = parseState(device.state);
              const newState = { ...currentState };
              const action = params.action;
              const actionParams = params.params || {};

              switch (action) {
                case 'power_on': newState.power = 'on'; break;
                case 'power_off': newState.power = 'off'; break;
                case 'toggle': newState.power = currentState.power === 'on' ? 'off' : 'on'; break;
                case 'set_state': Object.assign(newState, actionParams); break;
              }

              const status = newState.power === 'on' ? 'active' : 'standby';
              const updated = Device.updateState(device.id, stringifyState(newState));
              Device.update(device.id, { status, updated_at: new Date().toISOString() });
              wsManager.broadcastDeviceState(updated, schedule.user_id, 'schedule_control');
            }
          }

          Schedule.updateRunStatus(schedule.id, new Date().toISOString(), null);
          wsManager.broadcastScheduleExecute(schedule.id, schedule.user_id, 'completed', {
            schedule_name: schedule.name
          });
        } catch (err) {
          wsManager.broadcastScheduleExecute(schedule.id, schedule.user_id, 'failed', {
            schedule_name: schedule.name,
            error: err.message
          });
        }
      }, {
        scheduled: true,
        timezone: 'Asia/Shanghai'
      });

      activeTasks.set(schedule.id, task);
    } catch (err) {
      console.error('[Schedule] 任务调度失败:', err);
    }
  }

  static loadAllSchedules() {
    const schedules = Schedule.findEnabled();
    let loaded = 0;
    schedules.forEach(s => {
      try {
        this.scheduleTask(s);
        loaded++;
      } catch {}
    });
    console.log(`[Schedule] 已加载 ${loaded} 个定时任务`);
  }
}

module.exports = ScheduleController;
