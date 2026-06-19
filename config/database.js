const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/smart_home.json');
const dir = path.dirname(dbPath);

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const DEFAULT_DATA = {
  users: [],
  rooms: [],
  devices: [],
  scenes: [],
  scene_actions: [],
  schedules: [],
  messages: [],
  firmware_versions: [],
  device_firmware_history: [],
  _sequences: {}
};

let data = null;
let writeTimer = null;

function loadData() {
  if (!fs.existsSync(dbPath)) {
    data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    Object.keys(DEFAULT_DATA).forEach(k => {
      if (!k.startsWith('_') && !(k in data._sequences)) {
        data._sequences[k] = 0;
      }
    });
    saveData(true);
  } else {
    try {
      const raw = fs.readFileSync(dbPath, 'utf8');
      data = JSON.parse(raw);
      if (!data._sequences) data._sequences = {};
      Object.keys(DEFAULT_DATA).forEach(k => {
        if (!k.startsWith('_')) {
          if (!(k in data)) data[k] = [];
          if (!(k in data._sequences)) data._sequences[k] = 0;
        }
      });
    } catch (err) {
      console.error('[DB] 文件损坏，使用默认数据:', err.message);
      data = JSON.parse(JSON.stringify(DEFAULT_DATA));
      Object.keys(DEFAULT_DATA).forEach(k => {
        if (!k.startsWith('_')) data._sequences[k] = 0;
      });
    }
  }
}

function saveData(immediate = false) {
  clearTimeout(writeTimer);
  const doWrite = () => {
    try {
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('[DB] 保存失败:', err.message);
    }
  };
  if (immediate) doWrite();
  else writeTimer = setTimeout(doWrite, 50);
}

function nextId(table) {
  if (!data._sequences[table]) data._sequences[table] = 0;
  data._sequences[table] += 1;
  if (data[table] && data[table].length > 0) {
    const max = data[table].reduce((m, r) => Math.max(m, r.id || 0), 0);
    if (max >= data._sequences[table]) data._sequences[table] = max + 1;
  }
  return data._sequences[table];
}

function now() {
  return new Date().toISOString();
}

loadData();

module.exports = {
  getData: () => data,
  saveData,
  nextId,
  now
};
