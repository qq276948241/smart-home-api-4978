const errorHandler = (err, req, res, next) => {
  console.error('[ERROR]', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      code: 400,
      message: '数据验证失败',
      errors: err.errors || err.message
    });
  }

  if (err.status === 400 || err.code === 'SQLITE_CONSTRAINT') {
    return res.status(400).json({
      code: 400,
      message: err.message || '请求参数错误'
    });
  }

  if (err.status === 404) {
    return res.status(404).json({
      code: 404,
      message: err.message || '资源不存在'
    });
  }

  if (err.status === 403) {
    return res.status(403).json({
      code: 403,
      message: err.message || '没有权限执行此操作'
    });
  }

  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

const notFound = (req, res, next) => {
  res.status(404).json({
    code: 404,
    message: '接口不存在',
    path: req.originalUrl,
    method: req.method
  });
};

module.exports = { errorHandler, notFound };
