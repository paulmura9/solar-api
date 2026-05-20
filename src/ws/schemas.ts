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

// ===== Wire-format primitives =====

const ISO8601 = z.string().datetime({ offset: true });
const UUID = z.string().uuid();

// Telemetry stores whatever the ESP32 reports. Servo command limits (5..175)
// are enforced on outgoing commands only — the ESP32 may briefly report angles
// outside that band during initialization or fault recovery.
const SERVO_REPORT_MIN = 0;
const SERVO_REPORT_MAX = 180;

// Battery voltage hard cap — anything outside this is a sensor fault.
const BATTERY_VOLTAGE_MIN = 0;
const BATTERY_VOLTAGE_MAX = 20;
const SOLAR_VOLTAGE_MAX = 30;
const SOLAR_CURRENT_MAX = 10;
const SOLAR_POWER_MAX = 300;

// Envelope: every WS message carries v/type/id/timestamp/payload.
// We parse the envelope first to ack early validation; payload schema runs
// in the dispatcher so the failure mode is "valid envelope, bad payload"
// rather than swallowing both layers.
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

// ===== Device -> Express payloads =====

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

    battery_voltage: z.number().min(BATTERY_VOLTAGE_MIN).max(BATTERY_VOLTAGE_MAX),
    battery_percent: z.number().min(BATTERY_PERCENT_MIN).max(BATTERY_PERCENT_MAX).nullable().optional(),
    battery_status: z.enum(BATTERY_STATUSES).nullable().optional(),

    solar_voltage: z.number().min(0).max(SOLAR_VOLTAGE_MAX).nullable().optional(),
    solar_current: z.number().min(0).max(SOLAR_CURRENT_MAX).nullable().optional(),
    solar_power: z.number().min(0).max(SOLAR_POWER_MAX).nullable().optional(),
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

export type CommandAckPayload = z.infer<typeof commandAckPayloadSchema>;

export const esp32EventPayloadSchema = z
  .object({
    event_type: z.string().min(1).max(64),
    severity: z.enum(SEVERITIES),
    message: z.string().min(1).max(1000),
  })
  .strict();

export type Esp32EventPayload = z.infer<typeof esp32EventPayloadSchema>;

export const visionResultPayloadSchema = z
  .object({
    dirt_level_percent: z.number().min(DIRT_PERCENT_MIN).max(DIRT_PERCENT_MAX),
    cleanliness_percent: z.number().min(DIRT_PERCENT_MIN).max(DIRT_PERCENT_MAX),
    cleaning_required: z.boolean(),
    confidence: z.number().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX).nullable().optional(),
    image_path: z.string().min(1).max(500).nullable().optional(),
    processed_image_path: z.string().min(1).max(500).nullable().optional(),
  })
  .strict()
  .refine(
    // The two percentages model the same observation from opposite directions
    // and must sum to ~100. Tolerance covers float rounding only.
    (data) => Math.abs(data.dirt_level_percent + data.cleanliness_percent - 100) < 0.1,
    { message: 'dirt_level_percent + cleanliness_percent must equal 100' }
  );

export type VisionResultPayload = z.infer<typeof visionResultPayloadSchema>;

export const heartbeatPayloadSchema = z
  .object({
    esp32_alive: z.boolean().optional(),
  })
  .strict();

export type HeartbeatPayload = z.infer<typeof heartbeatPayloadSchema>;

// Pi reconnect sync: "I'm back, here's my last known command id and ESP32 state.
// Give me everything you've queued since."
export const syncRequestPayloadSchema = z
  .object({
    last_command_id: UUID.nullable(),
    esp32_alive: z.boolean(),
  })
  .strict();

export type SyncRequestPayload = z.infer<typeof syncRequestPayloadSchema>;

// ===== Express -> Device messages =====
//
// Outgoing commands follow the standard envelope. The command-specific
// fields (`command_type`, `args`) live inside `payload` so the shape matches
// every other v=1 message on the wire.

export const outgoingCommandPayloadSchema = z
  .object({
    command_type: z.enum(COMMAND_TYPES),
    args: z.record(z.unknown()),
  })
  .strict();

export const outgoingCommandSchema = z
  .object({
    v: z.literal(1),
    type: z.literal('command'),
    id: UUID,
    timestamp: ISO8601,
    payload: outgoingCommandPayloadSchema,
  })
  .strict();

export type OutgoingCommand = z.infer<typeof outgoingCommandSchema>;

// ===== Client -> Express messages =====
//
// Client inbound also wraps in the standard envelope. `payload.token` carries
// the new JWT on reauth; future client→server message types will discriminate
// on envelope.type and validate their own payload schema in the dispatcher.

export const clientReauthPayloadSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();

export type ClientReauthPayload = z.infer<typeof clientReauthPayloadSchema>;

export const CLIENT_MESSAGE_TYPES = ['reauth'] as const;
export type ClientMessageType = (typeof CLIENT_MESSAGE_TYPES)[number];

// Client inbound envelope: same shape as device envelope, distinct schema so
// the type union is constrained to legal client message types.
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

// ===== Express -> Client broadcast types =====
//
// All outbound /ws/client messages follow the envelope. `payload` carries
// the per-type data; `data` field is no longer used.

export const SERVER_OUTBOUND_TYPES = [
  'telemetry_update',
  'event',
  'vision_update',
  'command_status_update',
  'device_status_update',
  'server_shutting_down',
  'reauth_ok',
] as const;
export type ServerOutboundType = (typeof SERVER_OUTBOUND_TYPES)[number];

export interface ServerOutboundEnvelope {
  v: 1;
  type: ServerOutboundType;
  id: string;
  timestamp: string;
  // `object` matches the wire spec ("payload: object") and accepts any
  // non-null structured value — DTOs from services, plain records, etc.
  payload: object;
}
