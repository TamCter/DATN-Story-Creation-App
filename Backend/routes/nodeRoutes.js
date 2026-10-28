const express = require('express');
const router = express.Router();
const nodeController = require('../controllers/nodeController');
const { optionalAuth } = require('../middlewares/authMiddleware');

router.use(optionalAuth);

// Quản lý node theo ID
router.get('/:id', nodeController.getNodeById);
router.put('/:id', nodeController.updateNode);
router.delete('/:id', nodeController.deleteNode);

module.exports = router;

