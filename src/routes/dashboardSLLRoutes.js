const express = require('express');
const router = express.Router();
const dashboardSLLController = require('../controllers/dashboardSLLController');
const middleware = require('../middlewares/middleware');

// Rota: GET /dashboard/sll/dados
router.get('/dados', middleware.requireProfile('Service Line Leader'), dashboardSLLController.getDashboardSLLData);

module.exports = router;
