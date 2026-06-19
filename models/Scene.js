const BaseModel = require('./BaseModel');
const { getData, nextId, now, saveData } = require('../config/database');

class Scene extends BaseModel {
  constructor() {
    super('scenes');
  }

  findByUserId(userId) {
    const scenes = this._rows().filter(r => r.user_id == userId);
    const actions = getData().scene_actions || [];
    return scenes.map(s => ({
      ...s,
      action_count: actions.filter(a => a.scene_id === s.id).length
    })).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }

  getFullScene(sceneId) {
    const idNum = parseInt(sceneId);
    const scene = this._rows().find(r => r.id === idNum);
    if (!scene) return null;
    const actions = (getData().scene_actions || []).filter(a => a.scene_id === idNum);
    const devices = getData().devices || [];
    scene.actions = actions
      .map(a => {
        const dev = devices.find(d => d.id === a.device_id);
        return {
          ...a,
          device_name: dev ? dev.name : null,
          device_type: dev ? dev.type : null
        };
      })
      .sort((a, b) => a.action_order - b.action_order);
    return scene;
  }

  addAction(sceneId, actionData) {
    const rows = getData().scene_actions;
    const record = {
      id: nextId('scene_actions'),
      scene_id: parseInt(sceneId),
      ...actionData
    };
    rows.push(record);
    saveData();
    return record;
  }

  updateAction(actionId, actionData) {
    const idNum = parseInt(actionId);
    const rows = getData().scene_actions;
    const idx = rows.findIndex(r => r.id === idNum);
    if (idx < 0) return null;
    rows[idx] = { ...rows[idx], ...actionData, id: idNum };
    saveData();
    return rows[idx];
  }

  deleteAction(actionId) {
    const idNum = parseInt(actionId);
    const rows = getData().scene_actions;
    const len = rows.length;
    getData().scene_actions = rows.filter(r => r.id !== idNum);
    const changed = getData().scene_actions.length !== len;
    if (changed) saveData();
    return changed;
  }

  getActionsBySceneId(sceneId) {
    const idNum = parseInt(sceneId);
    const actions = (getData().scene_actions || []).filter(a => a.scene_id === idNum);
    const devices = getData().devices || [];
    return actions
      .map(a => {
        const dev = devices.find(d => d.id === a.device_id);
        return {
          ...a,
          device_name: dev ? dev.name : null,
          device_type: dev ? dev.type : null,
          is_online: dev ? !!dev.is_online : false
        };
      })
      .sort((a, b) => a.action_order - b.action_order);
  }

  _findActionWithUser(actionId) {
    const idNum = parseInt(actionId);
    const action = (getData().scene_actions || []).find(a => a.id === idNum);
    if (!action) return null;
    const scene = this._rows().find(s => s.id === action.scene_id);
    return scene ? { action, user_id: scene.user_id } : null;
  }
}

module.exports = new Scene();
