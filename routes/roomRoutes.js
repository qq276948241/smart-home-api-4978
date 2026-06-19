const express = require('express');
const RoomController = require('../controllers/RoomController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.get('/', RoomController.list);
router.post('/', RoomController.create);
router.get('/:id', RoomController.detail);
router.put('/:id', RoomController.update);
router.delete('/:id', RoomController.remove);

module.exports = router;
