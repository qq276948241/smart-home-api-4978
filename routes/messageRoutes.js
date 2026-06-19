const express = require('express');
const MessageController = require('../controllers/MessageController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.get('/', MessageController.list);
router.get('/unread-count', MessageController.unreadCount);
router.get('/:id', MessageController.detail);
router.post('/mark-read', MessageController.markAsRead);
router.post('/mark-read/:id', MessageController.markAsRead);
router.post('/mark-all-read', MessageController.markAllAsRead);
router.delete('/clear', MessageController.clear);
router.delete('/:id', MessageController.remove);

module.exports = router;
