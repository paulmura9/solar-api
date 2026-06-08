import { insertEvent } from '../../services/eventService';
import { getPreviousVisionResult, insertVisionResult } from '../../services/visionService';
import { isCleaningTransition, sendCleaningAlert } from '../../services/emailService';
import { broadcastVision } from '../broadcaster';
import { visionResultPayloadSchema } from '../schemas';
import { parseOr } from '../utils';
import { EVENT_TYPES } from '../../utils/constants';

// The owning device is not taken from the WS connection (that identity is the
// Pi gateway, not the panel) nor from the payload (the Pi does not send one).
// The DB column default assigns the panel device id at insert; we read it back
// from the inserted row for event attribution and recipient resolution.
export async function handleVisionResult(payload: unknown): Promise<void> {
  const parsed = parseOr(visionResultPayloadSchema, payload, 'vision_result');
  if (!parsed.ok) return;

  const inserted = await insertVisionResult(parsed.data);
  if (!inserted) return;

  broadcastVision(inserted);
  if (inserted.cleaningRequired) {
    await insertEvent({
      event_type: EVENT_TYPES.CLEANING_REQUIRED,
      severity: 'WARNING',
      message: `Vision pipeline flagged cleaning required (dirt=${inserted.dirtLevelPercent}%)`,
      device_id: inserted.deviceId,
    });
  }

  // Email only on the edge into "needs cleaning", never every cycle.
  const previous = await getPreviousVisionResult(inserted.id);
  if (isCleaningTransition(inserted, previous)) {
    await sendCleaningAlert(inserted, inserted.deviceId);
  }
}
