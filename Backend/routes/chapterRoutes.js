const express = require('express');
const router = express.Router();
const chapterController = require('../controllers/chapterController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.get('/:id', chapterController.getChapterById);
router.put('/:id', verifyToken, chapterController.updateChapter);
router.delete('/:id', chapterController.deleteChapter);

module.exports = router;
