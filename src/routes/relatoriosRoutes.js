const express = require('express');
const router = express.Router();
const relatoriosController = require('../controllers/relatoriosController');
const middleware = require('../middlewares/middleware');

// Rota do Consultor
router.post('/gerar', relatoriosController.gerarRelatorioConsultor);

// Rota do Talent Manager
router.post('/tm/gerar', middleware.requireProfile('Talent Manager'), relatoriosController.gerarRelatorioTM);

// Rota do SLL
router.post('/sll/gerar', middleware.requireProfile('Service Line Leader'), relatoriosController.gerarRelatorioSLL);

// Rota do Admin
router.post('/admin/gerar', middleware.requireProfile('Administrador'), relatoriosController.gerarRelatorioAdmin);

module.exports = router;
