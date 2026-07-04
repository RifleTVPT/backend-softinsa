const express = require('express');
const router = express.Router();
const conquistaController = require('../controllers/conquistaController');

router.get('/consultor/:idUtilizador', conquistaController.getConquistasConsultor);
router.get('/detalhes/:idUtilizador/:idMarco', conquistaController.getDetalhesConquista);

// Rotas Globais (SLL/Admin)
router.get('/global/lista', conquistaController.getAllConquistasGlobal);
router.get('/global/detalhes/:idMarco', conquistaController.getDetalhesConquistaGlobal);

// Download PDF
router.get('/:idUtilizador/:idMarco/certificado', conquistaController.downloadCertificadoConquista);

module.exports = router;