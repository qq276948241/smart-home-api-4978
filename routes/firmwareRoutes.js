const express = require('express');
const FirmwareController = require('../controllers/FirmwareController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { strictLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(authenticateToken);

router.get('/', FirmwareController.listVersions);
router.get('/latest', FirmwareController.getLatest);
router.get('/device/:device_id/check', FirmwareController.checkDeviceUpdate);
router.get('/device/:device_id/history', FirmwareController.getUpgradeHistory);
router.post('/device/:device_id/upgrade', strictLimiter, FirmwareController.startUpgrade);

router.post('/', requireAdmin, FirmwareController.createVersion);
router.put('/:id', requireAdmin, FirmwareController.updateVersion);
router.delete('/:id', requireAdmin, FirmwareController.deleteVersion);

module.exports = router;
