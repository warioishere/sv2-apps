import { Router } from 'express';
import { savedConfigController } from '../controllers/saved-config.controller';

const router = Router();

router.get('/', (req, res) => savedConfigController.getAll(req, res));
router.get('/active', (req, res) => savedConfigController.getActive(req, res));
router.get('/:id', (req, res) => savedConfigController.getById(req, res));
router.post('/', (req, res) => savedConfigController.save(req, res));
router.put('/:id', (req, res) => savedConfigController.update(req, res));
router.delete('/:id', (req, res) => savedConfigController.delete(req, res));
router.post('/:id/set-active', (req, res) => savedConfigController.setActive(req, res));

export default router;
