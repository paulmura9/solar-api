import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { withCacheHeaders } from '../middleware/cacheHeaders';
import { cachePolicy } from '../config/cachePolicy';
import { asyncHandler } from '../utils/asyncHandler';
import { getDevices, getDeviceLastSeen } from '../controllers/devices.controller';

const router = Router();

router.use(requireAuth);

router.get('/', withCacheHeaders(cachePolicy.devices), asyncHandler(getDevices));
router.get('/:device_name/last-seen', asyncHandler(getDeviceLastSeen));

export default router;
