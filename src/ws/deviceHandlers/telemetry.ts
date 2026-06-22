import { insertEvent } from '../../services/eventService';
import { insertTelemetry, buildTelemetryDTO } from '../../services/telemetryService';
import { upsertDeviceStatus } from '../../services/deviceService';
import { broadcastTelemetry } from '../broadcaster';
import { telemetryPayloadSchema } from '../schemas';
import { parseOr } from '../utils';
import { env } from '../../config/env';
import { EVENT_TYPES } from '../../utils/constants';

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

  broadcastTelemetry(buildTelemetryDTO(parsed.data));

  const now = Date.now();
  const interval = parsed.data.tracking_mode === 'NIGHT' ? PERSIST_NIGHT_MS : PERSIST_DAY_MS;
  if (now - lastPersistAt < interval) return;
  lastPersistAt = now;

  await insertTelemetry(parsed.data);
  await upsertDeviceStatus('ESP32', true, null, 'Telemetry received');
}
