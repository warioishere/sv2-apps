import { Router } from 'express';
import { configExamplesController } from '../controllers/config-examples.controller';

const router = Router();

router.get('/', (req, res) => configExamplesController.getAll(req, res));
router.get('/filter', (req, res) => configExamplesController.getByFilter(req, res));
router.get('/:id', (req, res) => configExamplesController.getExample(req, res));
router.get('/:id/toml', (req, res) => configExamplesController.getExampleToml(req, res));

export default router;
