import { Router } from 'express';
import * as wizardController from '../controllers/wizard.controller';

const router = Router();

// Bitcoin Core auto-detection
router.get('/detect-bitcoin-core', wizardController.detectBitcoinCore);

// Full stack configuration generation (sv2-tp + JD-Client)
router.post('/full-stack-config', wizardController.generateFullStackConfig);

export default router;
