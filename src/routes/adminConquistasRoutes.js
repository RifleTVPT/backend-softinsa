const express = require('express');
const router = express.Router();
const adminConquistasController = require('../controllers/adminConquistasController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const middleware = require('../middlewares/middleware');

router.use(middleware.requireProfile('Administrador'));

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

router.get('/lista', adminConquistasController.listarConquistas);
router.get('/detalhes/:id', adminConquistasController.getDetalhesConquista);
router.post('/criar', upload.single('imagem'), adminConquistasController.criarConquista);
router.delete('/:id', adminConquistasController.eliminarConquista);
router.post('/processar-rankings', adminConquistasController.processarRankings);

module.exports = router;
