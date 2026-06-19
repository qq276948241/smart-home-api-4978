const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Response = require('../utils/response');

class UserController {
  static async register(req, res) {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      return Response.error(res, '用户名、邮箱和密码不能为空', 400);
    }

    if (password.length < 6) {
      return Response.error(res, '密码长度不能少于6位', 400);
    }

    const existingUsername = User.findByUsername(username);
    if (existingUsername) {
      return Response.error(res, '用户名已存在', 400);
    }

    const existingEmail = User.findByEmail(email);
    if (existingEmail) {
      return Response.error(res, '邮箱已被注册', 400);
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const user = User.create({
      username,
      email,
      password: hashedPassword,
      role: role === 'admin' ? 'admin' : 'user'
    });

    return Response.success(res, {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      created_at: user.created_at
    }, '注册成功', 201);
  }

  static async login(req, res) {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return Response.error(res, '账号和密码不能为空', 400);
    }

    const user = User.findByUsernameOrEmail(identifier);
    if (!user) {
      return Response.error(res, '账号或密码错误', 401);
    }

    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      return Response.error(res, '账号或密码错误', 401);
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    return Response.success(res, {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    }, '登录成功');
  }

  static async getProfile(req, res) {
    const user = User.findById(req.user.id);
    if (!user) {
      return Response.error(res, '用户不存在', 404);
    }

    return Response.success(res, {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at
    });
  }

  static async updateProfile(req, res) {
    const { email, username } = req.body;
    const user = User.findById(req.user.id);

    if (!user) {
      return Response.error(res, '用户不存在', 404);
    }

    const updateData = {};
    if (email && email !== user.email) {
      const existing = User.findByEmail(email);
      if (existing) {
        return Response.error(res, '邮箱已被使用', 400);
      }
      updateData.email = email;
    }
    if (username && username !== user.username) {
      const existing = User.findByUsername(username);
      if (existing) {
        return Response.error(res, '用户名已被使用', 400);
      }
      updateData.username = username;
    }

    if (Object.keys(updateData).length === 0) {
      return Response.success(res, null, '没有需要更新的内容');
    }

    updateData.updated_at = new Date().toISOString();
    const updated = User.update(req.user.id, updateData);

    return Response.success(res, {
      id: updated.id,
      username: updated.username,
      email: updated.email,
      updated_at: updated.updated_at
    }, '更新成功');
  }

  static async changePassword(req, res) {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return Response.error(res, '原密码和新密码不能为空', 400);
    }

    if (newPassword.length < 6) {
      return Response.error(res, '新密码长度不能少于6位', 400);
    }

    const user = User.findById(req.user.id);
    if (!user) {
      return Response.error(res, '用户不存在', 404);
    }

    const isValid = bcrypt.compareSync(oldPassword, user.password);
    if (!isValid) {
      return Response.error(res, '原密码错误', 400);
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    User.update(req.user.id, {
      password: hashedPassword,
      updated_at: new Date().toISOString()
    });

    return Response.success(res, null, '密码修改成功');
  }

  static async logout(req, res) {
    return Response.success(res, null, '退出成功');
  }

  static async listUsers(req, res) {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    const total = User.count();
    const users = User.findAll({}, 'created_at DESC', pageSize, offset).map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      created_at: u.created_at
    }));

    return Response.paginated(res, users, page, pageSize, total);
  }
}

module.exports = UserController;
