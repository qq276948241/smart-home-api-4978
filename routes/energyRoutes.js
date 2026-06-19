const express = require('express');
const EnergyController = require('../controllers/EnergyController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.get('/rooms', EnergyController.getRoomStats);
router.get('/overview', EnergyController.getOverallStats);
router.get('/devices/:device_id', EnergyController.getDeviceStats);
router.get('/power-config', EnergyController.getPowerConfig);

module.exports = router;
