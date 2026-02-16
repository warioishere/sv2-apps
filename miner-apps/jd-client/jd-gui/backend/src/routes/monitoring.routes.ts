import { Router } from 'express';
import { monitoringController } from '../controllers/monitoring.controller';

const router = Router();

router.get('/dashboard', (req, res) => monitoringController.getDashboard(req, res));
router.get('/miners', (req, res) => monitoringController.getMiners(req, res));
router.get('/hashrate/global', (req, res) => monitoringController.getGlobalHashrate(req, res));
router.get('/hashrate/:downstreamId', (req, res) => monitoringController.getMinerHashrate(req, res));

export default router;
