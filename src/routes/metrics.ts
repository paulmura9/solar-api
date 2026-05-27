import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getMetrics } from '../controllers/metrics.controller';

const router = Router();

router.get('/', requireAuth, getMetrics);

export default router;
