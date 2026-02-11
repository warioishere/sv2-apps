import { Router } from 'express';
import { healthController } from '../controllers/health.controller';

const router = Router();

router.post('/:instanceId/check', (req, res) => healthController.checkInstance(req, res));
router.get('/:instanceId/history', (req, res) => healthController.getHistory(req, res));
router.get('/:instanceId/status', (req, res) => healthController.getLatestStatus(req, res));
router.get('/:instanceId/score', (req, res) => healthController.getHealthScore(req, res));

export default router;
