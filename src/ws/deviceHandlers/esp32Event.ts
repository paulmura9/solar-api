import { insertEvent } from '../../services/eventService';
import { broadcastEvent } from '../broadcaster';
import { esp32EventPayloadSchema } from '../schemas';
import { parseOr } from '../utils';

export async function handleEsp32Event(payload: unknown): Promise<void> {
  const parsed = parseOr(esp32EventPayloadSchema, payload, 'esp32_event');
  if (!parsed.ok) return;

  await insertEvent(parsed.data);
  broadcastEvent(parsed.data);
}
