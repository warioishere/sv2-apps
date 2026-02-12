import { Router } from 'express';
import { tpController } from '../controllers/tp.controller';

const router = Router();

router.post('/start', (req, res) => tpController.start(req, res));
router.post('/stop', (req, res) => tpController.stop(req, res));
router.post('/restart', (req, res) => tpController.restart(req, res));
router.get('/status', (req, res) => tpController.getStatus(req, res));
router.get('/logs', (req, res) => tpController.getLogs(req, res));

// Configuration endpoints
router.get('/config/current', (req, res) => tpController.getCurrentConfig(req, res));
router.post('/config', (req, res) => tpController.saveConfig(req, res));
router.post('/config/restore', (req, res) => tpController.restoreDefaultConfig(req, res));
router.post('/validate-path', (req, res) => tpController.validatePath(req, res));

export default router;
