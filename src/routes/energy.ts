import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { getEnergySummaryHandler, getDirtImpactHandler } from '../controllers/energy.controller';
import { energyQuerySchema, dirtImpactQuerySchema } from '../validators/storage.schema';

const router = Router();

router.use(requireAuth);

router.get('/summary', validateQuery(energyQuerySchema), asyncHandler(getEnergySummaryHandler));
router.get('/dirt-impact', validateQuery(dirtImpactQuerySchema), asyncHandler(getDirtImpactHandler));

export default router;
