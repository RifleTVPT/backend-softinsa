const express = require('express');
const mobileController = require('../controllers/mobileController');
const middleware = require('../middlewares/middleware');

const router = express.Router();

router.get('/sync', mobileController.sincronizarConsultor);
router.post('/pedidos', middleware.checkToken, mobileController.receberPedidoMobile);

module.exports = router;
