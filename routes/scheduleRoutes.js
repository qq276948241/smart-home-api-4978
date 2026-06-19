const express = require('express');
const ScheduleController = require('../controllers/ScheduleController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.get('/', ScheduleController.list);
router.post('/', ScheduleController.create);
router.get('/:id', ScheduleController.detail);
router.put('/:id', ScheduleController.update);
router.post('/:id/toggle', ScheduleController.toggle);
router.delete('/:id', ScheduleController.remove);

module.exports = router;
