import { Router } from 'express';
import { jdcController } from '../controllers/jdc.controller';

const router = Router();

router.post('/start', (req, res) => jdcController.start(req, res));
router.post('/stop', (req, res) => jdcController.stop(req, res));
router.post('/restart', (req, res) => jdcController.restart(req, res));
router.get('/status', (req, res) => jdcController.getStatus(req, res));
router.get('/logs', (req, res) => jdcController.getLogs(req, res));

export default router;
