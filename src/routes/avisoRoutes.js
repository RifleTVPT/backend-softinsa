const express = require('express');
const router = express.Router();
const avisoController = require('../controllers/avisoController');
const middleware = require('../middlewares/middleware');

router.get('/', avisoController.getAllAvisos);
router.post('/', middleware.requireProfile('Administrador'), avisoController.createAviso);
router.put('/:id', middleware.requireProfile('Administrador'), avisoController.updateAviso);
router.put('/:id/status', middleware.requireProfile('Administrador'), avisoController.toggleStatus);
router.delete('/:id', middleware.requireProfile('Administrador'), avisoController.eliminarAviso);

module.exports = router;
