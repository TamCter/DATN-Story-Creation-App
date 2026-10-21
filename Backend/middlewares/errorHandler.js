/**
 * Middleware xử lý lỗi tập trung cho toàn bộ ứng dụng
 */
function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.url}:`, err);

  // Lỗi xác thực Neo4j
  if (err.code === 'Neo.ClientError.Security.Unauthorized') {
    return res.status(401).json({
      success: false,
      error: 'Neo4j Unauthorized',
      message: 'Sai tên đăng nhập hoặc mật khẩu Neo4j. Vui lòng kiểm tra file .env.',
    });
  }

  // Lỗi kết nối Neo4j
  if (err.code === 'ServiceUnavailable' || (err.message && err.message.includes('connect ECONNREFUSED'))) {
    return res.status(503).json({
      success: false,
      error: 'Neo4j Service Unavailable',
      message: 'Không thể kết nối đến máy chủ Neo4j. Hãy kiểm tra Neo4j Desktop / Docker đã được bật hay chưa.',
    });
  }

  // Lỗi cú pháp Cypher hoặc Constraint
  if (err.code && err.code.startsWith('Neo.ClientError')) {
    return res.status(400).json({
      success: false,
      error: err.code,
      message: err.message,
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    error: err.name || 'InternalServerError',
    message: err.message || 'Đã xảy ra lỗi máy chủ nội bộ',
  });
}

module.exports = errorHandler;
