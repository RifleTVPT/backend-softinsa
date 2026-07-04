const express = require('express');
const router = express.Router();
const meusBadgesController = require('../controllers/meusBadgesController');

// Rotas do Consultor
router.get('/consultor/:idUtilizador', meusBadgesController.getMeusBadges);
router.get('/consultor/:idUtilizador/badge/:idBadge', meusBadgesController.getDetalhesBadgeObtido);
router.get('/consultor/:idUtilizador/badge/:idBadge/certificado', meusBadgesController.downloadCertificado);

// Rotas Públicas (Partilha Externa)
router.get('/verificacao/:linkUnico', meusBadgesController.getVerificacaoPublica);
router.get('/verificacao-especial/:idUtilizador/:idMarco', meusBadgesController.getVerificacaoEspecialPublica);
router.get('/galeria/:idUtilizador', meusBadgesController.getGaleriaPublica);

module.exports = router;