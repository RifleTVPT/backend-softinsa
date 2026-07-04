const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const multer = require('multer');
const path = require('path');

// Configuração do Multer (Onde guardar e que nome dar)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../../uploads')); // Pasta destino
    },
    filename: function (req, file, cb) {
        const idUtilizador = req.params.idUtilizador;
        const extensao = path.extname(file.originalname);
        cb(null, `avatar_${idUtilizador}_${Date.now()}${extensao}`); // Ex: avatar_1_1623432.jpg
    }
});
const upload = multer({ storage: storage });

const middleware = require('../middlewares/middleware');

// Rotas existentes
router.post('/login', userController.login);
router.post('/register', userController.register);
router.get('/configuracoes/:idUtilizador', middleware.checkToken, userController.getConfiguracoes);
router.put('/configuracoes/:idUtilizador', middleware.checkToken, userController.updateConfiguracoes);
router.put('/mudar-password/:idUtilizador', middleware.checkToken, userController.mudarPassword);
router.post('/verificar-email-recuperacao', userController.verificarEmailRecuperacao);
router.post('/recuperar-password', userController.recuperarPassword);
router.put('/fcm-token', middleware.checkToken, userController.registarFcmToken);

// NOVA ROTA COM O MIDDLEWARE DO MULTER
router.post('/upload-avatar/:idUtilizador', middleware.checkToken, upload.single('avatar'), userController.uploadAvatar);

module.exports = router;
