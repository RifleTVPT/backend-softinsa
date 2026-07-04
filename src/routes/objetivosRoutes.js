const express = require('express');
const router = express.Router();
const objetivosController = require('../controllers/objetivosController');

router.get('/consultor/:idUtilizador', objetivosController.getObjetivosConsultor);
router.post('/criar', objetivosController.criarObjetivo);
router.put('/concluir/:idObjetivo', objetivosController.marcarConcluido);

module.exports = router;