const express = require('express');
const router = express.Router();
const { chatWithAI } = require('../controllers/aiController');
const { optionalAuth } = require('../middlewares/authMiddleware');

// Cho phép cả người dùng đã đăng nhập và khách
router.use(optionalAuth);

// POST /api/ai/chat - Chat với AI để tạo node
router.post('/chat', chatWithAI);

module.exports = router;

