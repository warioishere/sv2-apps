import { Router } from 'express';
import { downstreamController } from '../controllers/downstream.controller';

const router = Router();

router.get('/miners', (req, res) => downstreamController.getMiners(req, res));

export default router;
