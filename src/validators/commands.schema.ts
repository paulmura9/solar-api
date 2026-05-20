import { z } from 'zod';
import { COMMAND_STATUSES } from '../utils/constants';

const servoAngle = z.number().int().min(5).max(175);

export const createCommandSchema = z.discriminatedUnion('command_type', [
  z.object({
    command_type: z.literal('SET_MODE'),
    payload: z.object({ mode: z.enum(['AUTO', 'MANUAL', 'IDLE']) }),
  }),
  z.object({
    command_type: z.literal('MOVE_PANEL'),
    payload: z.object({ h_angle: servoAngle, v_angle: servoAngle }),
  }),
  z.object({
    command_type: z.literal('RESET_POSITION'),
    payload: z.object({}).optional().default({}),
  }),
  z.object({
    command_type: z.literal('REQUEST_STATUS'),
    payload: z.object({}).optional().default({}),
  }),
  z.object({
    command_type: z.literal('START_TRACKING'),
    payload: z.object({}).optional().default({}),
  }),
  z.object({
    command_type: z.literal('STOP_TRACKING'),
    payload: z.object({}).optional().default({}),
  }),
  z.object({
    command_type: z.literal('TRIGGER_CLEANING'),
    payload: z.object({}).optional().default({}),
  }),
]);

export const commandQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.string().optional().refine(
    (val) => {
      if (val === undefined) return true;
      return val.split(',').every((s) => (COMMAND_STATUSES as readonly string[]).includes(s.trim()));
    },
    { message: `Each status must be one of: ${COMMAND_STATUSES.join(', ')}` }
  ),
});
