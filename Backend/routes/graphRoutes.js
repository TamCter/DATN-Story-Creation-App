const express = require('express');
const router = express.Router();
const graphController = require('../controllers/graphController');

// Tìm đường đi ngắn nhất giữa 2 thực thể
router.get('/shortest-path', graphController.getShortestPath);

// Lấy vùng lân cận của 1 node
router.get('/nodes/:id/neighborhood', graphController.getNodeNeighborhood);

module.exports = router;
