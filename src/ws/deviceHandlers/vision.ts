import { insertEvent } from '../../services/eventService';
import { getPreviousVisionResult, insertVisionResult } from '../../services/visionService';
import { isCleaningTransition, sendCleaningAlert } from '../../services/emailService';
import { broadcastVision } from '../broadcaster';
import { visionResultPayloadSchema } from '../schemas';
import { parseOr } from '../utils';
import { EVENT_TYPES } from '../../utils/constants';

// deviceId is the authenticated identity of the device WS connection. We use it
// for persistence, event attribution, and recipient resolution rather than the
// payload's device_id, which the gateway could spoof to another device's id.
export async function handleVisionResult(deviceId: string, payload: unknown): Promise<void> {
  const parsed = parseOr(visionResultPayloadSchema, payload, 'vision_result');
  if (!parsed.ok) return;

  const inserted = await insertVisionResult(parsed.data, deviceId);
  if (!inserted) return;

  broadcastVision(inserted);
  if (inserted.cleaningRequired) {
    await insertEvent({
      event_type: EVENT_TYPES.CLEANING_REQUIRED,
      severity: 'WARNING',
      message: `Vision pipeline flagged cleaning required (dirt=${inserted.dirtLevelPercent}%)`,
      device_id: deviceId,
    });
  }

  // Email only on the edge into "needs cleaning", never every cycle.
  const previous = await getPreviousVisionResult(inserted.id);
  if (isCleaningTransition(inserted, previous)) {
    await sendCleaningAlert(inserted, deviceId);
  }
}
