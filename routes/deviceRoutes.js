const express = require('express');
const DeviceController = require('../controllers/DeviceController');
const { authenticateToken } = require('../middleware/auth');
const { strictLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(authenticateToken);

router.get('/', DeviceController.list);
router.post('/', DeviceController.create);
router.post('/batch-control', strictLimiter, DeviceController.batchControl);
router.get('/:id', DeviceController.detail);
router.put('/:id', DeviceController.update);
router.delete('/:id', DeviceController.remove);
router.post('/:id/control', strictLimiter, DeviceController.control);
router.post('/:id/online', DeviceController.setOnline);

module.exports = router;
