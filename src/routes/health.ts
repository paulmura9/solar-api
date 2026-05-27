import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { getHealth, getDeepHealthHandler, getReadyHandler } from '../controllers/health.controller';

const router = Router();

// GET /health is intentionally public so platform liveness probes (Railway,
// load balancers) can hit it without credentials. The deep and ready
// variants leak Supabase connectivity state and are gated behind auth.
router.get('/', getHealth);
router.get('/deep', requireAuth, asyncHandler(getDeepHealthHandler));
router.get('/ready', requireAuth, asyncHandler(getReadyHandler));

export default router;
