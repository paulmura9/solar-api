import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { getHealth, getDeepHealthHandler, getReadyHandler } from '../controllers/health.controller';

const router = Router();

router.get('/', getHealth);
router.get('/deep', asyncHandler(getDeepHealthHandler));
router.get('/ready', asyncHandler(getReadyHandler));

export default router;
