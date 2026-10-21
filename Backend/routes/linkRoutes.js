const express = require('express');
const router = express.Router();
const linkController = require('../controllers/linkController');

router.post('/', linkController.createLink);
router.get('/:id', linkController.getLinkById);
router.put('/:id', linkController.updateLink);
router.delete('/:id', linkController.deleteLink);

module.exports = router;
