import { insertEvent } from '../../services/eventService';
import { broadcastEvent } from '../broadcaster';
import { esp32EventPayloadSchema } from '../schemas';
import { parseOr } from '../utils';
import { env } from '../../config/env';

export async function handleEsp32Event(payload: unknown): Promise<void> {
  const parsed = parseOr(esp32EventPayloadSchema, payload, 'esp32_event');
  if (!parsed.ok) return;

  // Reported by the ESP32 via the Pi — always attributable to the device.
  await insertEvent({ ...parsed.data, device_id: env.DEFAULT_DEVICE_ID });
  broadcastEvent(parsed.data);
}
