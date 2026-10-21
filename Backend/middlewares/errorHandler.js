/**
 * Middleware xử lý lỗi tập trung cho toàn bộ ứng dụng
 */
function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.url}:`, err);

  // Lỗi xác thực Neo4j (báo 500 cho client, không làm lộ thông tin xác thực)
  if (err.code === 'Neo.ClientError.Security.Unauthorized') {
    return res.status(500).json({
      success: false,
      error: 'DatabaseAuthenticationError',
      message: 'Lỗi xác thực cơ sở dữ liệu trên máy chủ',
    });
  }

  // Lỗi kết nối Neo4j
  if (err.code === 'ServiceUnavailable' || (err.message && err.message.includes('connect ECONNREFUSED'))) {
    return res.status(503).json({
      success: false,
      error: 'DatabaseServiceUnavailable',
      message: 'Dịch vụ cơ sở dữ liệu tạm thời không khả dụng',
    });
  }

  // Lỗi cú pháp Cypher hoặc Constraint
  if (err.code && err.code.startsWith('Neo.ClientError')) {
    return res.status(400).json({
      success: false,
      error: 'DatabaseRequestError',
      message: 'Yêu cầu không hợp lệ hoặc vi phạm ràng buộc dữ liệu',
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    error: statusCode >= 500 ? 'InternalServerError' : (err.name || 'RequestError'),
    message: statusCode >= 500 ? 'Đã xảy ra lỗi máy chủ nội bộ' : (err.message || 'Yêu cầu không hợp lệ'),
  });
}

module.exports = errorHandler;
