const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const multer = require('multer');
const middleware = require('../middlewares/middleware');

const upload = multer({ storage: multer.memoryStorage() });

// Rotas existentes
router.post('/login', userController.login);
router.post('/register', userController.register);
router.get('/configuracoes/:idUtilizador', middleware.checkToken, userController.getConfiguracoes);
router.put('/configuracoes/:idUtilizador', middleware.checkToken, userController.updateConfiguracoes);
router.put('/mudar-password/:idUtilizador', middleware.checkToken, userController.mudarPassword);
router.post('/verificar-email-recuperacao', userController.verificarEmailRecuperacao);
router.post('/recuperar-password', userController.recuperarPassword);
router.put('/fcm-token', middleware.checkToken, userController.registarFcmToken);
router.post('/upload-avatar/:idUtilizador', middleware.checkToken, upload.single('avatar'), userController.uploadAvatar);

module.exports = router;
