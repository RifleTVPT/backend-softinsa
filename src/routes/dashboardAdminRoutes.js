const express = require('express');
const router = express.Router();
const dashboardAdminController = require('../controllers/dashboardAdminController');
const middleware = require('../middlewares/middleware');

router.get('/dados', middleware.requireProfile('Administrador'), dashboardAdminController.getDashboardAdminData);

module.exports = router;
