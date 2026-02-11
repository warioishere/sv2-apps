import { Router } from 'express';
import { configController } from '../controllers/config.controller';

const router = Router();

router.post('/validate', (req, res) => configController.validate(req, res));
router.post('/', (req, res) => configController.save(req, res));
router.get('/', (req, res) => configController.load(req, res));

export default router;
