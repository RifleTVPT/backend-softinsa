const express = require('express');
const router = express.Router();
const pedidosController = require('../controllers/pedidosController');
const middleware = require('../middlewares/middleware');

// Rotas Consultor
router.get('/consultor/:idUtilizador', pedidosController.getHistoricoConsultor);
router.get('/detalhes/:idPedido', pedidosController.getDetalhesPedido);
router.post('/consultor/renovar', pedidosController.renovarPedido);

// Rotas Talent Manager
router.get('/tm/pendentes', middleware.requireProfile('Talent Manager'), pedidosController.getPendentesTM);
router.get('/tm/analisar/:id', middleware.requireProfile('Talent Manager'), pedidosController.getDetalhesAnalisarTM);
router.post('/tm/decisao/:id', middleware.requireProfile('Talent Manager'), pedidosController.tomarDecisaoTM);
router.get('/tm/historico', middleware.requireProfile('Talent Manager'), pedidosController.getHistoricoTM);

// Rotas Service Line Leader
router.get('/sll/pendentes', middleware.requireProfile('Service Line Leader'), pedidosController.getPendentesSLL);
router.get('/sll/analisar/:id', middleware.requireProfile('Service Line Leader'), pedidosController.getDetalhesAnalisarTM);
router.post('/sll/decisao/:id', middleware.requireProfile('Service Line Leader'), pedidosController.tomarDecisaoSLL);
router.get('/sll/historico', middleware.requireProfile('Service Line Leader'), pedidosController.getHistoricoSLL);

// Rotas Administrador
router.get('/admin/todos', middleware.requireProfile('Administrador'), pedidosController.getTodosPedidosAdmin);
router.delete('/admin/eliminar/:id', middleware.requireProfile('Administrador'), pedidosController.eliminarPedidoAdmin);

module.exports = router;
