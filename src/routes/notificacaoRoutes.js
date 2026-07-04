const express = require('express');
const router = express.Router();
const notificacaoController = require('../controllers/notificacaoController');

router.get('/user/:idUtilizador', notificacaoController.getByUser);
router.put('/user/:idUtilizador/read-all', notificacaoController.markAllAsRead);
router.put('/:id/read', notificacaoController.markAsRead);

module.exports = router;