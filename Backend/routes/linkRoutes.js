const express = require('express');
const router = express.Router();
const linkController = require('../controllers/linkController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.use(verifyToken);
router.post('/', linkController.createLink);
router.get('/:id', linkController.getLinkById);
router.put('/:id', linkController.updateLink);
router.delete('/:id', linkController.deleteLink);

module.exports = router;
