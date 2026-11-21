const express = require('express');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const {
  chatWithAI,
  clearChatHistory,
  generateChapterAndEvents,
  generateChapterStory,
  getChatHistory,
  saveChatHistory,
} = require('../controllers/aiController');
const { verifyToken } = require('../middlewares/authMiddleware');

const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
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
router.get('/chat-history/:projectId', getChatHistory);
router.put('/chat-history/:projectId', saveChatHistory);
router.delete('/chat-history/:projectId', clearChatHistory);
router.post('/chat', aiChatLimiter, aiChatAggregateLimiter, chatWithAI);
router.post('/generate-chapter-events', aiChatLimiter, aiChatAggregateLimiter, generateChapterAndEvents);
router.post('/generate-chapter-story', aiChatLimiter, aiChatAggregateLimiter, generateChapterStory);

module.exports = router;

