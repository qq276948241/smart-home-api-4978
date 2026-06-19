const rateLimit = require('express-rate-limit');

const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: {
    code: 429,
    message: '请求过于频繁，请稍后再试',
    data: null
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? `user_${req.user.id}` : req.ip;
  }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    code: 429,
    message: '登录尝试次数过多，请15分钟后再试',
    data: null
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    code: 429,
    message: '操作过于频繁，请稍后再试',
    data: null
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? `user_${req.user.id}` : req.ip;
  }
});

module.exports = { generalLimiter, loginLimiter, strictLimiter };
