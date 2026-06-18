import { insertEvent } from '../../services/eventService';
import { insertTelemetry, buildTelemetryDTO } from '../../services/telemetryService';
import { upsertDeviceStatus } from '../../services/deviceService';
import { broadcastTelemetry } from '../broadcaster';
import { telemetryPayloadSchema } from '../schemas';
import { parseOr } from '../utils';
import { env } from '../../config/env';
import { EVENT_TYPES } from '../../utils/constants';

// Persistence is throttled while the live feed broadcasts every frame: 30s by
// day, 60s at night (ESP32 already halves its night send rate). 60s < the 90s
// offline threshold, so the device-status refresh keeps the device online.
const PERSIST_DAY_MS = 30_000;
const PERSIST_NIGHT_MS = 60_000;

let lastPersistAt = 0;

export async function handleTelemetry(payload: unknown): Promise<void> {
  const parsed = parseOr(telemetryPayloadSchema, payload, 'telemetry');
  if (!parsed.ok) {
    await insertEvent({
      event_type: EVENT_TYPES.SENSOR_ERROR,
      severity: 'WARNING',
      message: `Invalid telemetry payload: ${parsed.reason}`,
      device_id: env.DEFAULT_DEVICE_ID,
    });
    return;
  }

  // Live: broadcast every frame so the dashboard updates at the ESP32 rate.
  broadcastTelemetry(buildTelemetryDTO(parsed.data));

  // Persist + refresh device status on a throttle keyed by tracking mode.
  const now = Date.now();
  const interval = parsed.data.tracking_mode === 'NIGHT' ? PERSIST_NIGHT_MS : PERSIST_DAY_MS;
  if (now - lastPersistAt < interval) return;
  lastPersistAt = now;

  await insertTelemetry(parsed.data);
  await upsertDeviceStatus('ESP32', true, null, 'Telemetry received');
}
