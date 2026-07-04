const express = require('express');
const router = express.Router();
const sllBadgesController = require('../controllers/sllBadgesController');
const middleware = require('../middlewares/middleware');

router.get('/atribuidos', middleware.requireProfile('Service Line Leader'), sllBadgesController.getBadgesAtribuidosSL);

module.exports = router;
