const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const DISABLED_ACCOUNT_IDS = new Set(['user-guest-demo']);
const DISABLED_ACCOUNT_EMAILS = new Set(['guest@storyapp.vn']);

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is missing or empty.');
}

function isDisabledAccount(identity) {
  return (
    DISABLED_ACCOUNT_IDS.has(identity.id) ||
    DISABLED_ACCOUNT_EMAILS.has(identity.email?.toLowerCase())
  );
}

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
    if (!decoded.id || isDisabledAccount(decoded)) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản không còn được phép truy cập. Vui lòng đăng nhập bằng tài khoản hợp lệ.',
      });
    }

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
  isDisabledAccount,
  JWT_SECRET,
};
