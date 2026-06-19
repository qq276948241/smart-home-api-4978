const { getData, saveData, nextId, now } = require('../config/database');

class BaseModel {
  constructor(table) {
    this.table = table;
  }

  _rows() {
    return getData()[this.table] || [];
  }

  findById(id) {
    const idNum = parseInt(id);
    return this._rows().find(r => r.id === idNum) || null;
  }

  findAll(filters = {}, orderBy = 'created_at DESC', limit = null, offset = 0) {
    let rows = [...this._rows()];

    if (Object.keys(filters).length > 0) {
      rows = rows.filter(r => {
        return Object.keys(filters).every(k => {
          const v = filters[k];
          if (v === null || v === undefined) return r[k] === null || r[k] === undefined;
          if (typeof v === 'boolean') return (r[k] ? 1 : 0) === (v ? 1 : 0);
          return r[k] == v;
        });
      });
    }

    if (orderBy) {
      const parts = orderBy.split(' ');
      const field = parts[0];
      const dir = (parts[1] || 'DESC').toUpperCase();
      rows.sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        let cmp = 0;
        if (av < bv) cmp = -1;
        else if (av > bv) cmp = 1;
        return dir === 'ASC' ? cmp : -cmp;
      });
    }

    const start = parseInt(offset) || 0;
    const end = limit ? start + (parseInt(limit) || 0) : rows.length;
    return rows.slice(start, end);
  }

  count(filters = {}) {
    let rows = this._rows();
    if (Object.keys(filters).length > 0) {
      rows = rows.filter(r => {
        return Object.keys(filters).every(k => {
          const v = filters[k];
          if (v === null || v === undefined) return r[k] === null || r[k] === undefined;
          if (typeof v === 'boolean') return (r[k] ? 1 : 0) === (v ? 1 : 0);
          return r[k] == v;
        });
      });
    }
    return rows.length;
  }

  create(data) {
    const rows = getData()[this.table];
    const record = {
      id: nextId(this.table),
      created_at: now(),
      updated_at: now(),
      ...data
    };
    rows.push(record);
    saveData();
    return record;
  }

  update(id, data) {
    const idNum = parseInt(id);
    const rows = getData()[this.table];
    const idx = rows.findIndex(r => r.id === idNum);
    if (idx < 0) return null;
    rows[idx] = {
      ...rows[idx],
      ...data,
      id: idNum,
      updated_at: now()
    };
    saveData();
    return rows[idx];
  }

  delete(id) {
    const idNum = parseInt(id);
    const rows = getData()[this.table];
    const len = rows.length;
    getData()[this.table] = rows.filter(r => r.id !== idNum);
    const changed = getData()[this.table].length !== len;
    if (changed) saveData();
    return changed;
  }
}

module.exports = BaseModel;
