class ResponseFormatter {
  static success(res, data = null, message = '操作成功', code = 200) {
    return res.status(code).json({
      code,
      message,
      data,
      timestamp: Date.now()
    });
  }

  static error(res, message = '操作失败', code = 400, errors = null) {
    const response = {
      code,
      message,
      data: null,
      timestamp: Date.now()
    };
    if (errors) response.errors = errors;
    return res.status(code).json(response);
  }

  static paginated(res, items, page, pageSize, total, message = '获取成功') {
    return res.status(200).json({
      code: 200,
      message,
      data: {
        items,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total: parseInt(total),
          totalPages: Math.ceil(total / pageSize)
        }
      },
      timestamp: Date.now()
    });
  }
}

module.exports = ResponseFormatter;
