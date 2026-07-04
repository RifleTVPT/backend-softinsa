const express = require('express');
const router = express.Router();
const expiracaoController = require('../controllers/expiracaoController');
const middleware = require('../middlewares/middleware');

router.get('/badges', middleware.requireProfile('Talent Manager', 'Service Line Leader'), expiracaoController.getBadgesExpiracao);
router.post('/notificar', middleware.requireProfile('Talent Manager', 'Service Line Leader'), expiracaoController.notificarConsultor);

module.exports = router;
