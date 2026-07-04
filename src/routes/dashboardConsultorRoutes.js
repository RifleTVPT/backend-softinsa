const express = require('express');
const router = express.Router();
const dashboardConsultorController = require('../controllers/dashboardConsultorController');

// Rota específica para o dashboard do consultor
router.get('/dados/:id', dashboardConsultorController.getDashboardData);

module.exports = router;