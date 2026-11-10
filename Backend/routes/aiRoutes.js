const crypto = require('crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const { chatWithAI } = require('../controllers/aiController');
const { verifyToken } = require('../middlewares/authMiddleware');

const getRequestRateLimitKey = (req) => {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  const clientIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : '';
  const sessionId = req.headers['x-session-id'] || req.headers['x-device-id'] || clientIp;

  if (sessionId) {
    return `guest:${sessionId}`;
  }

  if (!req.__aiGuestLimiterId) {
    req.__aiGuestLimiterId = `guest:${crypto.randomUUID()}`;
  }

  return req.__aiGuestLimiterId;
};

const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRequestRateLimitKey,
  message: {
    success: false,
    message: 'Bạn đang gửi quá nhiều yêu cầu chat. Hãy thử lại sau 1 phút.',
  },
  statusCode: 429,
});

const aiChatAggregateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => 'global-ai-chat',
  message: {
    success: false,
    message: 'Hệ thống AI đang nhận quá nhiều yêu cầu. Hãy thử lại sau 1 phút.',
  },
  statusCode: 429,
});

router.use(verifyToken);
router.post('/chat', aiChatLimiter, aiChatAggregateLimiter, chatWithAI);

module.exports = router;

