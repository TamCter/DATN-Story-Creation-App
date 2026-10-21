const express = require('express');
const router = express.Router();
const seedController = require('../controllers/seedController');

// Bảo vệ toàn bộ seed routes: chỉ cho phép khi ENABLE_SEED_ROUTES === 'true'
router.use((req, res, next) => {
  if (process.env.ENABLE_SEED_ROUTES !== 'true') {
    return res.status(403).json({
      success: false,
      message: 'Các endpoint nạp/xóa dữ liệu mẫu (Seed routes) đang bị vô hiệu hóa. Thiết lập ENABLE_SEED_ROUTES=true trong file .env để kích hoạt.',
    });
  }
  next();
});

router.post('/', seedController.seedDatabase);
router.delete('/clear', seedController.clearDatabase);

module.exports = router;
