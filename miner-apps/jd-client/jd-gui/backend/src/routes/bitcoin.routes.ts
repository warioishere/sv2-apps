import { Router } from 'express';
import {
  getBitcoinCoreStatus,
  startBitcoinCore,
  stopBitcoinCore,
  getBitcoinCoreLogs,
  restartBitcoinCore,
  getBitcoinConfig,
  updateBitcoinConfig,
} from '../controllers/bitcoin.controller';

const router = Router();

router.get('/status', getBitcoinCoreStatus);
router.post('/start', startBitcoinCore);
router.post('/stop', stopBitcoinCore);
router.post('/restart', restartBitcoinCore);
router.get('/logs', getBitcoinCoreLogs);
router.get('/config', getBitcoinConfig);
router.post('/config', updateBitcoinConfig);

export default router;
