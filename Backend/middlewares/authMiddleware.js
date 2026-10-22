const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'story_creation_super_secret_jwt_key_2026';

/**
 * Middleware xác thực JSON Web Token từ Authorization Header
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Yêu cầu chưa được xác thực. Vui lòng đăng nhập để tiếp tục.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Token không hợp lệ hoặc đã bị chỉnh sửa.',
    });
  }
}

module.exports = {
  verifyToken,
  JWT_SECRET,
};
