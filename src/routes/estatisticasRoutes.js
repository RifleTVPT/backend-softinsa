const express = require('express');
const router = express.Router();
const estatisticasController = require('../controllers/estatisticasController');
const middleware = require('../middlewares/middleware');

//Rotas para Consultor
router.get('/consultor/:idUtilizador', estatisticasController.getDashboardConsultor);
router.get('/consultor/:idUtilizador/detalhadas', estatisticasController.getEstatisticasDetalhadas);

// Rotas para Talent Manager
router.get('/talent/gamificacao', middleware.requireProfile('Talent Manager'), estatisticasController.getGamificacaoTM);

// Rotas para SLL
router.get('/sll/gamificacao', middleware.requireProfile('Service Line Leader'), estatisticasController.getGamificacaoSLL);

// Rotas para Admin
router.get('/admin/metricas', middleware.requireProfile('Administrador'), estatisticasController.getMetricasGlobaisAdmin);

module.exports = router;
