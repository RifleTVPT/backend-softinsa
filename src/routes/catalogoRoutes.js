const express = require('express');
const router = express.Router();
const catalogoController = require('../controllers/catalogoController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const middleware = require('../middlewares/middleware');

// Configuração do multer para guardar os uploads na pasta backend-softinsa/uploads
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Gerar nome único para evitar conflitos
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Rotas do Catálogo Global
router.get('/badges', catalogoController.getAllBadges);
router.get('/badges/:id', catalogoController.getBadgeDetails);
router.post('/candidatar', upload.array('ficheiros', 20), catalogoController.candidatar);

// Rotas de Rascunho
router.post('/rascunho', upload.array('ficheiros', 20), catalogoController.saveRascunho);
router.get('/rascunho/:idBadge/:idUtilizador', catalogoController.getRascunho);

// Admin
router.post('/admin/badge/criar', middleware.requireProfile('Administrador'), catalogoController.createBadge);
router.delete('/admin/badge/:id', middleware.requireProfile('Administrador'), catalogoController.deleteBadge);
router.put('/admin/badge/:id', middleware.requireProfile('Administrador'), catalogoController.updateBadge);

module.exports = router;
