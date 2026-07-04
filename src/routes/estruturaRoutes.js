const express = require('express');
const router = express.Router();
const estruturaController = require('../controllers/estruturaController');

const middleware = require('../middlewares/middleware');

router.get('/', estruturaController.getEstruturaCompleta);
router.post('/learning-path', middleware.checkToken, middleware.requireProfile('Administrador'), estruturaController.criarLearningPath);
router.post('/service-line', middleware.checkToken, middleware.requireProfile('Administrador'), estruturaController.criarServiceLine);
router.post('/area', middleware.checkToken, middleware.requireProfile('Administrador'), estruturaController.criarArea);
router.post('/area/:id/nivel', middleware.checkToken, middleware.requireProfile('Administrador'), estruturaController.adicionarNivelArea);
router.post('/requisito', middleware.checkToken, middleware.requireProfile('Administrador'), estruturaController.adicionarRequisito);
router.delete('/requisito/:id', middleware.checkToken, middleware.requireProfile('Administrador'), estruturaController.eliminarRequisito);
router.delete('/area/:id/nivel', middleware.checkToken, middleware.requireProfile('Administrador'), estruturaController.eliminarNivelMaisAlto);
router.delete('/learning-path/:id', middleware.checkToken, middleware.requireProfile('Administrador'), estruturaController.eliminarLearningPath);
router.delete('/service-line/:id', middleware.checkToken, middleware.requireProfile('Administrador'), estruturaController.eliminarServiceLine);
router.delete('/area/:id', middleware.checkToken, middleware.requireProfile('Administrador'), estruturaController.eliminarArea);

router.put('/learning-path/:id', middleware.checkToken, middleware.requireProfile('Administrador'), estruturaController.editarLearningPath);
router.put('/service-line/:id', middleware.checkToken, middleware.requireProfile('Administrador'), estruturaController.editarServiceLine);
router.put('/area/:id', middleware.checkToken, middleware.requireProfile('Administrador'), estruturaController.editarArea);

module.exports = router;
