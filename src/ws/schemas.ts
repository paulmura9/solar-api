import { z } from 'zod';
import {
  TRACKING_MODES,
  BATTERY_STATUSES,
  SEVERITIES,
  COMMAND_TYPES,
  LDR_MIN,
  LDR_MAX,
  BATTERY_PERCENT_MIN,
  BATTERY_PERCENT_MAX,
  DIRT_PERCENT_MIN,
  DIRT_PERCENT_MAX,
  CONFIDENCE_MIN,
  CONFIDENCE_MAX,
} from '../utils/constants';

const ISO8601 = z.string().datetime({ offset: true });
const UUID = z.string().uuid();

const SERVO_REPORT_MIN = 0;
const SERVO_REPORT_MAX = 180;

const BATTERY_VOLTAGE_MIN = 0;
const BATTERY_VOLTAGE_MAX = 20;
const SOLAR_VOLTAGE_MAX = 30;
const SOLAR_CURRENT_MAX = 10;
const SOLAR_POWER_MAX = 300;
// Sensors report SI units (A / W) and can read a small negative deadband
// near zero from offset/noise; accept it instead of rejecting the packet.
const SOLAR_CURRENT_MIN = -0.5;
const SOLAR_POWER_MIN = -1;

export const wsEnvelopeSchema = z
  .object({
    v: z.literal(1),
    type: z.string().min(1).max(64),
    id: UUID,
    timestamp: ISO8601,
    payload: z.unknown(),
  })
  .strict();

export type WsEnvelope = z.infer<typeof wsEnvelopeSchema>;

export const telemetryPayloadSchema = z
  .object({
    horizontal_angle: z.number().min(SERVO_REPORT_MIN).max(SERVO_REPORT_MAX),
    vertical_angle: z.number().min(SERVO_REPORT_MIN).max(SERVO_REPORT_MAX),
    tracking_mode: z.enum(TRACKING_MODES),
    is_moving: z.boolean(),

    ldr_top_left: z.number().int().min(LDR_MIN).max(LDR_MAX).nullable().optional(),
    ldr_top_right: z.number().int().min(LDR_MIN).max(LDR_MAX).nullable().optional(),
    ldr_bottom_left: z.number().int().min(LDR_MIN).max(LDR_MAX).nullable().optional(),
    ldr_bottom_right: z.number().int().min(LDR_MIN).max(LDR_MAX).nullable().optional(),

    horizontal_light_difference: z.number().finite().nullable().optional(),
    vertical_light_difference: z.number().finite().nullable().optional(),

    battery_voltage: z.number().min(BATTERY_VOLTAGE_MIN).max(BATTERY_VOLTAGE_MAX).nullable().optional(),
    battery_percent: z.number().min(BATTERY_PERCENT_MIN).max(BATTERY_PERCENT_MAX).nullable().optional(),
    battery_status: z.enum(BATTERY_STATUSES).nullable().optional(),

    solar_voltage: z.number().min(0).max(SOLAR_VOLTAGE_MAX).nullable().optional(),
    solar_current: z.number().min(SOLAR_CURRENT_MIN).max(SOLAR_CURRENT_MAX).nullable().optional(),
    solar_power: z.number().min(SOLAR_POWER_MIN).max(SOLAR_POWER_MAX).nullable().optional(),
    solar_energy_today_wh: z.number().min(0).nullable().optional(),

    charging_voltage: z.number().min(0).max(SOLAR_VOLTAGE_MAX).nullable().optional(),
    charging_current: z.number().min(0).max(SOLAR_CURRENT_MAX).nullable().optional(),
    charging_power: z.number().min(0).max(SOLAR_POWER_MAX).nullable().optional(),
    charged_energy_today_wh: z.number().min(0).nullable().optional(),

    ambient_light_lux: z.number().min(0).nullable().optional(),
  })
  .strict();

export type TelemetryPayload = z.infer<typeof telemetryPayloadSchema>;

export const commandAckPayloadSchema = z
  .object({
    commandId: UUID,
    status: z.enum(['ACKNOWLEDGED', 'FAILED']),
    error_message: z.string().max(500).nullable().optional(),
    ack_payload: z.record(z.unknown()).optional(),
  })
  .strict();

export const esp32EventPayloadSchema = z
  .object({
    event_type: z.string().min(1).max(64),
    severity: z.enum(SEVERITIES),
    message: z.string().min(1).max(1000),
  })
  .strict();

const IMAGE_PATH_MAX = 500;
const PERCENT_SUM_TOTAL = 100;
const PERCENT_SUM_TOLERANCE = 0.1;

export const visionResultPayloadSchema = z
  .object({
    dirt_level_percent: z.number().min(DIRT_PERCENT_MIN).max(DIRT_PERCENT_MAX),
    cleanliness_percent: z.number().min(DIRT_PERCENT_MIN).max(DIRT_PERCENT_MAX),
    cleaning_required: z.boolean(),
    confidence: z.number().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX),
    image_path: z.string().min(1).max(IMAGE_PATH_MAX),
    processed_image_path: z.string().min(1).max(IMAGE_PATH_MAX).nullable(),
    captured_at: ISO8601,
  })
  .strict()
  .refine(
    (data) =>
      Math.abs(data.dirt_level_percent + data.cleanliness_percent - PERCENT_SUM_TOTAL) <
      PERCENT_SUM_TOLERANCE,
    { message: 'dirt_level_percent + cleanliness_percent must equal 100' }
  );

export type VisionResultPayload = z.infer<typeof visionResultPayloadSchema>;

export const heartbeatPayloadSchema = z
  .object({
    esp32_alive: z.boolean().optional(),
    camera_ok: z.boolean().optional(),
  })
  .strict();

export const syncRequestPayloadSchema = z.object({
  last_command_id: UUID.nullable(),
});

const CAPTURE_ERROR_MESSAGE_MAX = 500;
const CAPTURE_DIMENSION_MAX = 100_000;

export const cameraCaptureResultPayloadSchema = z.discriminatedUnion('status', [
  z
    .object({
      command_id: UUID,
      status: z.literal('SUCCESS'),
      image_path: z.string().min(1).max(IMAGE_PATH_MAX),
      width: z.number().int().positive().max(CAPTURE_DIMENSION_MAX).optional(),
      height: z.number().int().positive().max(CAPTURE_DIMENSION_MAX).optional(),
      captured_at: ISO8601,
    })
    .strict(),
  z
    .object({
      command_id: UUID,
      status: z.literal('FAILED'),
      error_message: z.string().min(1).max(CAPTURE_ERROR_MESSAGE_MAX).optional(),
    })
    .strict(),
]);

export type CameraCaptureResultPayload = z.infer<typeof cameraCaptureResultPayloadSchema>;

export const outgoingCommandSchema = z
  .object({
    v: z.literal(1),
    type: z.literal('command'),
    id: UUID,
    timestamp: ISO8601,
    payload: z
      .object({
        command_type: z.enum(COMMAND_TYPES),
        args: z.record(z.unknown()),
      })
      .strict(),
  })
  .strict();

export type OutgoingCommand = z.infer<typeof outgoingCommandSchema>;

export const clientReauthPayloadSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();

const CLIENT_MESSAGE_TYPES = ['reauth'] as const;

export const clientIncomingEnvelopeSchema = z
  .object({
    v: z.literal(1),
    type: z.enum(CLIENT_MESSAGE_TYPES),
    id: UUID,
    timestamp: ISO8601,
    payload: z.unknown(),
  })
  .strict();

export type ClientIncomingEnvelope = z.infer<typeof clientIncomingEnvelopeSchema>;

export type ServerOutboundType =
  | 'telemetry_update'
  | 'event'
  | 'vision_update'
  | 'command_status_update'
  | 'capture_complete'
  | 'device_status_update'
  | 'server_shutting_down'
  | 'reauth_ok';

export interface ServerOutboundEnvelope {
  v: 1;
  type: ServerOutboundType;
  id: string;
  timestamp: string;

  payload: object;
}
