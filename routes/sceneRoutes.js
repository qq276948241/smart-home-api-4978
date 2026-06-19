const express = require('express');
const SceneController = require('../controllers/SceneController');
const { authenticateToken } = require('../middleware/auth');
const { strictLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(authenticateToken);

router.get('/', SceneController.list);
router.post('/', SceneController.create);
router.get('/:id', SceneController.detail);
router.put('/:id', SceneController.update);
router.delete('/:id', SceneController.remove);
router.post('/:id/execute', strictLimiter, SceneController.execute);
router.post('/:scene_id/actions', SceneController.addAction);
router.put('/actions/:action_id', SceneController.updateAction);
router.delete('/actions/:action_id', SceneController.removeAction);

module.exports = router;
