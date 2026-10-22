const express = require('express');
const router = express.Router();

const projectController = require('../controllers/projectController');
const nodeController = require('../controllers/nodeController');
const linkController = require('../controllers/linkController');
const graphController = require('../controllers/graphController');
const chapterController = require('../controllers/chapterController');

const { optionalAuth, verifyToken } = require('../middlewares/authMiddleware');

// Áp dụng middleware nhận diện User cho các endpoint đọc
router.use(optionalAuth);

// Quản lý Project CRUD
router.get('/', projectController.getAllProjects);
router.get('/:id', projectController.getProjectById);
router.post('/', verifyToken, projectController.createProject);
router.put('/:id', verifyToken, projectController.updateProject);
router.delete('/:id', verifyToken, projectController.deleteProject);

// Lấy toàn bộ đồ thị theo Project (dành cho màn hình Graph Canvas)
router.get('/:projectId/graph', graphController.getProjectGraph);

// Quản lý Nodes trong Project
router.get('/:projectId/nodes', nodeController.getNodesByProject);
router.post('/:projectId/nodes', verifyToken, nodeController.createNode);

// Quản lý Links trong Project
router.get('/:projectId/links', linkController.getLinksByProject);

// Quản lý Chapters trong Project
router.get('/:projectId/chapters', chapterController.getChaptersByProject);
router.post('/:projectId/chapters', verifyToken, chapterController.createChapter);

module.exports = router;
