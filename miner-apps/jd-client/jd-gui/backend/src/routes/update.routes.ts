import { Router } from 'express';
import { updateController } from '../controllers/update.controller';

const router = Router();

router.get('/check', (req, res) => updateController.checkForUpdates(req, res));
router.post('/perform', (req, res) => updateController.performUpdate(req, res));
router.get('/status', (req, res) => updateController.getStatus(req, res));
router.post('/rollback', (req, res) => updateController.rollback(req, res));
router.get('/history', (req, res) => updateController.getHistory(req, res));

export default router;
