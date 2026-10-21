const express = require('express');
const router = express.Router();
const seedController = require('../controllers/seedController');

router.post('/', seedController.seedDatabase);
router.delete('/clear', seedController.clearDatabase);

module.exports = router;
