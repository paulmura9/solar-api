import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getDevices, getDeviceLastSeen } from '../controllers/devices.controller';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(getDevices));
router.get('/:device_name/last-seen', asyncHandler(getDeviceLastSeen));

export default router;
