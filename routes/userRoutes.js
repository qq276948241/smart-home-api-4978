const express = require('express');
const UserController = require('../controllers/UserController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/register', loginLimiter, UserController.register);
router.post('/login', loginLimiter, UserController.login);
router.post('/logout', authenticateToken, UserController.logout);
router.get('/profile', authenticateToken, UserController.getProfile);
router.put('/profile', authenticateToken, UserController.updateProfile);
router.put('/password', authenticateToken, UserController.changePassword);
router.get('/list', authenticateToken, requireAdmin, UserController.listUsers);

module.exports = router;
