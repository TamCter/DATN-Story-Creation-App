const express = require('express');
const router = express.Router();

const projectController = require('../controllers/projectController');
const nodeController = require('../controllers/nodeController');
const linkController = require('../controllers/linkController');
const graphController = require('../controllers/graphController');
const chapterController = require('../controllers/chapterController');

const { optionalAuth, verifyToken } = require('../middlewares/authMiddleware');
const { runQuery } = require('../config/neo4j');

// Áp dụng middleware nhận diện User cho các endpoint đọc
router.use(optionalAuth);

/**
 * Middleware kiểm tra quyền truy cập dự án dùng chung cho các route đọc dữ liệu theo :projectId.
 * Trả về 404 nếu không tìm thấy dự án, trả về 403 nếu dự án thuộc sở hữu của người khác.
 */
async function verifyProjectAccess(req, res, next) {
  const { projectId } = req.params;
  const userId = req.user?.id;

  try {
    const query = `
      MATCH (p:Project { id: $projectId })
      OPTIONAL MATCH (owner:User)-[:OWNS]->(p)
      RETURN p, owner.id AS ownerId
    `;
    const records = await runQuery(query, { projectId }, 'READ');
    if (!records.length || !records[0]?.p) {
      return res.status(404).json({ success: false, message: `Không tìm thấy dự án với ID: ${projectId}` });
    }

    const ownerId = records[0].ownerId;
    if (ownerId && ownerId !== userId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập dự án này' });
    }

    next();
  } catch (error) {
    next(error);
  }
}

// Quản lý Project CRUD
router.get('/', projectController.getAllProjects);
router.get('/:id', projectController.getProjectById);
router.post('/', verifyToken, projectController.createProject);
router.put('/:id', verifyToken, projectController.updateProject);
router.delete('/:id', verifyToken, projectController.deleteProject);

// Lấy toàn bộ đồ thị theo Project (dành cho màn hình Graph Canvas)
router.get('/:projectId/graph', verifyProjectAccess, graphController.getProjectGraph);

// Quản lý Nodes trong Project
router.get('/:projectId/nodes', verifyProjectAccess, nodeController.getNodesByProject);
router.post('/:projectId/nodes', optionalAuth, nodeController.createNode);

// Quản lý Links trong Project
router.get('/:projectId/links', verifyProjectAccess, linkController.getLinksByProject);

// Quản lý Chapters trong Project
router.get('/:projectId/chapters', verifyProjectAccess, chapterController.getChaptersByProject);
router.post('/:projectId/chapters', verifyToken, chapterController.createChapter);

module.exports = router;
