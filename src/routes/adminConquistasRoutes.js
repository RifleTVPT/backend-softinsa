const express = require('express');
const router = express.Router();
const adminConquistasController = require('../controllers/adminConquistasController');
const multer = require('multer');
const middleware = require('../middlewares/middleware');

router.use(middleware.requireProfile('Administrador'));

const upload = multer({ storage: multer.memoryStorage() });

router.get('/lista', adminConquistasController.listarConquistas);
router.get('/detalhes/:id', adminConquistasController.getDetalhesConquista);
router.post('/criar', upload.single('imagem'), adminConquistasController.criarConquista);
router.delete('/:id', adminConquistasController.eliminarConquista);
router.post('/processar-rankings', adminConquistasController.processarRankings);

module.exports = router;
