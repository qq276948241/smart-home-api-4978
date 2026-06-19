require('dotenv').config();
const { getData, saveData, nextId, now } = require('../config/database');
const bcrypt = require('bcryptjs');

const initDB = () => {
  const data = getData();

  if (!data._meta || !data._meta.initialized) {
    const defaultUser = data.users.find(u => u.username === 'admin');
    if (!defaultUser) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      const userId = nextId('users');
      data.users.push({
        id: userId,
        username: 'admin',
        email: 'admin@smarthome.com',
        password: hashedPassword,
        role: 'admin',
        created_at: now(),
        updated_at: now()
      });
      console.log('默认管理员账号创建成功: admin / admin123');
    }

    if (!data._meta) data._meta = {};
    data._meta.initialized = true;
    data._meta.version = '1.0.0';
    saveData(true);
    console.log('数据库初始化完成!');
  } else {
    console.log('数据库已初始化，跳过初始化步骤。');
  }
};

initDB();
