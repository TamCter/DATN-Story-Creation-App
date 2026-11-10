const express = require('express');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const { chatWithAI } = require('../controllers/aiController');
const { verifyToken } = require('../middlewares/authMiddleware');

const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip || 'anonymous',
  message: {
    success: false,
    message: 'Bạn đang gửi quá nhiều yêu cầu chat. Hãy thử lại sau 1 phút.',
  },
  statusCode: 429,
});

router.use(verifyToken);
router.post('/chat', aiChatLimiter, chatWithAI);

module.exports = router;

