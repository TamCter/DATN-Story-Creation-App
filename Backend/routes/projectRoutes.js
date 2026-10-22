const express = require('express');
const router = express.Router();

const projectController = require('../controllers/projectController');
const nodeController = require('../controllers/nodeController');
const linkController = require('../controllers/linkController');
const graphController = require('../controllers/graphController');
const chapterController = require('../controllers/chapterController');

const { optionalAuth } = require('../middlewares/authMiddleware');

// Áp dụng middleware nhận diện User từ JWT Token
router.use(optionalAuth);

// Quản lý Project CRUD
router.get('/', projectController.getAllProjects);
router.get('/:id', projectController.getProjectById);
router.post('/', projectController.createProject);
router.put('/:id', projectController.updateProject);
router.delete('/:id', projectController.deleteProject);

// Lấy toàn bộ đồ thị theo Project (dành cho màn hình Graph Canvas)
router.get('/:projectId/graph', graphController.getProjectGraph);

// Quản lý Nodes trong Project
router.get('/:projectId/nodes', nodeController.getNodesByProject);
router.post('/:projectId/nodes', nodeController.createNode);

// Quản lý Links trong Project
router.get('/:projectId/links', linkController.getLinksByProject);

// Quản lý Chapters trong Project
router.get('/:projectId/chapters', chapterController.getChaptersByProject);
router.post('/:projectId/chapters', chapterController.createChapter);

module.exports = router;
