const express = require('express');
const router = express.Router();
const consultoresTMController = require('../controllers/consultoresTMController');
const middleware = require('../middlewares/middleware');

router.get('/lista', middleware.requireProfile('Talent Manager'), consultoresTMController.getListaConsultores);
router.get('/perfil/:id', middleware.requireProfile('Talent Manager'), consultoresTMController.getPerfilConsultor);

module.exports = router;
