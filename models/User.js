const BaseModel = require('./BaseModel');
const { getData } = require('../config/database');

class User extends BaseModel {
  constructor() {
    super('users');
  }

  findByUsername(username) {
    return this._rows().find(r => r.username === username) || null;
  }

  findByEmail(email) {
    return this._rows().find(r => r.email === email) || null;
  }

  findByUsernameOrEmail(identifier) {
    return this._rows().find(r => r.username === identifier || r.email === identifier) || null;
  }
}

module.exports = new User();
