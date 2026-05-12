import { z } from 'zod';
import { DEVICE_NAMES } from '../utils/constants';

export const deviceNameParamSchema = z.object({
  device_name: z.enum(DEVICE_NAMES),
});
