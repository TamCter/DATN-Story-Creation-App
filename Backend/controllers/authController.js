const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { runQuery } = require('../config/neo4j');
const { JWT_SECRET } = require('../middlewares/authMiddleware');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Đăng ký tài khoản người dùng mới
 */
async function register(req, res, next) {
  try {
    const { penName, email, password } = req.body || {};

    if (!penName || !penName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Bút danh là bắt buộc.',
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email là bắt buộc.',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanEmail = email.trim().toLowerCase();
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Địa chỉ email không đúng định dạng.',
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu phải có ít nhất 6 ký tự.',
      });
    }

    // Băm mật khẩu với bcrypt cost factor tối thiểu 10
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `user-${crypto.randomUUID().slice(0, 8)}`;
    const cleanPenName = penName.trim();
    const now = Date.now();

    const createQuery = `
      CREATE (u:User {
        id: $id,
        penName: $penName,
        email: $email,
        passwordHash: $passwordHash,
        createdAt: $createdAt
      })
      RETURN u
    `;

    let result;
    try {
      result = await runQuery(
        createQuery,
        {
          id: userId,
          penName: cleanPenName,
          email: cleanEmail,
          passwordHash,
          createdAt: now,
        },
        'WRITE'
      );
    } catch (dbError) {
      // Bắt lỗi trùng lặp email trực tiếp từ Constraint của Neo4j
      if (
        dbError.code === 'Neo.ClientError.Schema.ConstraintValidationFailed' ||
        dbError.message?.includes('already exists with label `User` and property `email`')
      ) {
        return res.status(409).json({
          success: false,
          message: 'Email này đã được sử dụng. Vui lòng đăng nhập hoặc dùng email khác.',
        });
      }
      throw dbError;
    }

    const createdUser = result[0]?.u || {
      id: userId,
      penName: cleanPenName,
      email: cleanEmail,
      createdAt: now,
    };

    // Tạo JWT token
    const token = jwt.sign(
      {
        id: createdUser.id,
        email: createdUser.email,
        penName: createdUser.penName,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công!',
      data: {
        user: {
          id: createdUser.id,
          penName: createdUser.penName,
          email: createdUser.email,
          createdAt: createdUser.createdAt,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Đăng nhập người dùng bằng email và mật khẩu
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập email.',
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mật khẩu.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const findQuery = `
      MATCH (u:User { email: $email })
      RETURN u
      LIMIT 1
    `;
    const records = await runQuery(findQuery, { email: cleanEmail }, 'READ');

    if (!records.length || !records[0]?.u) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không chính xác.',
      });
    }

    const user = records[0].u;

    const isMatch = await bcrypt.compare(password, user.passwordHash || '');
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không chính xác.',
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        penName: user.penName,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      data: {
        user: {
          id: user.id,
          penName: user.penName,
          email: user.email,
          createdAt: user.createdAt,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Lấy thông tin tài khoản hiện tại từ Token
 */
async function getMe(req, res, next) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin phiên làm việc.',
      });
    }

    const query = `
      MATCH (u:User { id: $id })
      RETURN u
      LIMIT 1
    `;
    const records = await runQuery(query, { id: userId }, 'READ');

    if (!records.length || !records[0]?.u) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin người dùng.',
      });
    }

    const user = records[0].u;

    return res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          penName: user.penName,
          email: user.email,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Đăng nhập nhanh với tài khoản mẫu (Khách / Guest)
 */
async function guestLogin(req, res, next) {
  try {
    const guestEmail = 'guest@storyapp.vn';
    const guestPenName = 'Lăng Tiêu Khách';

    const findQuery = `
      MATCH (u:User { email: $email })
      RETURN u
      LIMIT 1
    `;
    let records = await runQuery(findQuery, { email: guestEmail }, 'READ');

    let user;
    if (!records.length || !records[0]?.u) {
      const passwordHash = await bcrypt.hash('guest123456', 10);
      const userId = 'user-guest-demo';
      const now = Date.now();

      const createQuery = `
        CREATE (u:User {
          id: $id,
          penName: $penName,
          email: $email,
          passwordHash: $passwordHash,
          createdAt: $createdAt
        })
        RETURN u
      `;
      const createRes = await runQuery(
        createQuery,
        {
          id: userId,
          penName: guestPenName,
          email: guestEmail,
          passwordHash,
          createdAt: now,
        },
        'WRITE'
      );
      user = createRes[0]?.u;
    } else {
      user = records[0].u;
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        penName: user.penName,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      success: true,
      message: 'Đăng nhập với tài khoản mẫu thành công!',
      data: {
        user: {
          id: user.id,
          penName: user.penName,
          email: user.email,
          createdAt: user.createdAt,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  getMe,
  guestLogin,
};
