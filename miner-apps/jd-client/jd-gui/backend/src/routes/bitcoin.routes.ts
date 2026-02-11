import { Router } from 'express';
import {
  getBitcoinCoreStatus,
  startBitcoinCore,
  stopBitcoinCore,
  getBitcoinCoreLogs,
} from '../controllers/bitcoin.controller';

const router = Router();

router.get('/status', getBitcoinCoreStatus);
router.post('/start', startBitcoinCore);
router.post('/stop', stopBitcoinCore);
router.get('/logs', getBitcoinCoreLogs);

export default router;
