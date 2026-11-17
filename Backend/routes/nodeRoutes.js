const express = require('express');
const router = express.Router();
const nodeController = require('../controllers/nodeController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.use(verifyToken);

// Quản lý node theo ID
router.get('/:id', nodeController.getNodeById);
router.put('/:id', nodeController.updateNode);
router.delete('/:id', nodeController.deleteNode);

module.exports = router;

