import { insertEvent } from '../../services/eventService';
import { insertTelemetry } from '../../services/telemetryService';
import { upsertDeviceStatus } from '../../services/deviceService';
import { broadcastTelemetry } from '../broadcaster';
import { telemetryPayloadSchema } from '../schemas';
import { parseOr } from '../utils';
import { EVENT_TYPES } from '../../utils/constants';

export async function handleTelemetry(payload: unknown): Promise<void> {
  const parsed = parseOr(telemetryPayloadSchema, payload, 'telemetry');
  if (!parsed.ok) {
    await insertEvent({
      event_type: EVENT_TYPES.SENSOR_ERROR,
      severity: 'WARNING',
      message: `Invalid telemetry payload: ${parsed.reason}`,
    });
    return;
  }

  const inserted = await insertTelemetry(parsed.data);
  if (!inserted) return;

  await upsertDeviceStatus('ESP32', true, null, 'Telemetry received');
  broadcastTelemetry(inserted);
}
