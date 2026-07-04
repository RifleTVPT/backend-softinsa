const express = require('express');
const router = express.Router();
const dashboardTMController = require('../controllers/dashboardTMController');
const middleware = require('../middlewares/middleware');

router.get('/dados', middleware.requireProfile('Talent Manager'), dashboardTMController.getDashboardTMData);

module.exports = router;
