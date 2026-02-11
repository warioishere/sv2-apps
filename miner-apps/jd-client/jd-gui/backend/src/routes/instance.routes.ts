import { Router } from 'express';
import { instanceController } from '../controllers/instance.controller';

const router = Router();

router.get('/', (req, res) => instanceController.getAllInstances(req, res));
router.get('/:id', (req, res) => instanceController.getInstanceStatus(req, res));
router.post('/', (req, res) => instanceController.createInstance(req, res));
router.post('/:id/start', (req, res) => instanceController.startInstance(req, res));
router.post('/:id/stop', (req, res) => instanceController.stopInstance(req, res));
router.post('/:id/restart', (req, res) => instanceController.restartInstance(req, res));
router.delete('/:id', (req, res) => instanceController.deleteInstance(req, res));
router.get('/:id/logs', (req, res) => instanceController.getInstanceLogs(req, res));

export default router;
