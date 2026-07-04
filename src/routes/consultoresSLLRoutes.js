const express = require('express');
const router = express.Router();
const consultoresSLLController = require('../controllers/consultoresSLLController');
const middleware = require('../middlewares/middleware');

router.get('/lista', middleware.requireProfile('Service Line Leader'), consultoresSLLController.getListaConsultoresSL);
router.get('/perfil/:id', middleware.requireProfile('Service Line Leader'), consultoresSLLController.getPerfilConsultorSL);

module.exports = router;
