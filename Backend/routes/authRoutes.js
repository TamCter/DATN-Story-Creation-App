const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');

// Các tuyến đường công khai
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/guest', authController.guestLogin);

// Các tuyến đường yêu cầu xác thực
router.get('/me', verifyToken, authController.getMe);

module.exports = router;
