const express = require('express');
const mobileController = require('../controllers/mobileController');

const router = express.Router();

router.get('/sync', mobileController.sincronizarConsultor);

module.exports = router;
