import { Router } from 'express';
import { metricsController } from '../controllers/metrics.controller';

const router = Router();

router.get('/:instanceId', (req, res) => metricsController.getInstanceMetrics(req, res));
router.get('/:instanceId/latest', (req, res) => metricsController.getLatestMetrics(req, res));
router.get('/:instanceId/types', (req, res) => metricsController.getMetricTypes(req, res));
router.get('/:instanceId/uptime', (req, res) => metricsController.getUptimePercentage(req, res));
router.get('/:instanceId/:metricType/summary', (req, res) => metricsController.getMetricSummary(req, res));
router.get('/:instanceId/:metricType/timeseries', (req, res) => metricsController.getTimeSeries(req, res));

export default router;
