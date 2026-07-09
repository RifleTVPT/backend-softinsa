const express = require('express');
const router = express.Router();
const catalogoController = require('../controllers/catalogoController');
const multer = require('multer');
const middleware = require('../middlewares/middleware');

const upload = multer({ storage: multer.memoryStorage() });

// Rotas do Catalogo Global
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
