const express = require('express');
const router = express.Router();
const adminUsersController = require('../controllers/adminUsersController');
const middleware = require('../middlewares/middleware');

router.use(middleware.requireProfile('Administrador'));

router.get('/lista', adminUsersController.getTodosUtilizadores);
router.post('/criar', adminUsersController.criarUtilizador);
router.get('/perfil/:id', adminUsersController.getPerfilUtilizador);
router.put('/perfil/:id', adminUsersController.atualizarUtilizador);
router.put('/desativar/:id', adminUsersController.desativarUtilizador);
router.put('/ativar/:id', adminUsersController.ativarUtilizador);

// --- ROTAS PARA REGISTOS PENDENTES ---
router.get('/registos/pendentes', adminUsersController.getPendentesRegisto);
router.get('/registos/:id', adminUsersController.getDetalhesRegisto);
router.put('/registos/:id/aceitar', adminUsersController.aceitarRegisto);
router.put('/registos/:id/recusar', adminUsersController.recusarRegisto);

// --- ROTAS PARA LOGS DE ATIVIDADE ---
router.get('/atividades', adminUsersController.getLogAtividades);

module.exports = router;
