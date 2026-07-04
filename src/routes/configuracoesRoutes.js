const express = require('express');
const router = express.Router();
const configuracoesController = require('../controllers/configuracoesController');
const middleware = require('../middlewares/middleware');

router.get('/rgpd', configuracoesController.getRGPD); // Endpoint público
router.get('/', middleware.checkToken, configuracoesController.getConfiguracoes);
router.put('/', middleware.checkToken, middleware.requireProfile('Administrador'), configuracoesController.updateConfiguracoes);
router.post('/testar-email', middleware.checkToken, middleware.requireProfile('Administrador'), configuracoesController.testarEmail);

module.exports = router;
