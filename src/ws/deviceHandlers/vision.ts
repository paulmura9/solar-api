import { insertEvent } from '../../services/eventService';
import { getPreviousVisionResult, insertVisionResult } from '../../services/visionService';
import { isCleaningTransition, sendCleaningAlert } from '../../services/emailService';
import { broadcastVision } from '../broadcaster';
import { visionResultPayloadSchema } from '../schemas';
import { parseOr } from '../utils';
import { env } from '../../config/env';
import { EVENT_TYPES } from '../../utils/constants';

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
      device_id: parsed.data.device_id ?? env.DEFAULT_DEVICE_ID,
    });
  }

  // Email only on the edge into "needs cleaning", never every cycle.
  const previous = await getPreviousVisionResult(inserted.id);
  if (isCleaningTransition(inserted, previous)) {
    await sendCleaningAlert(inserted);
  }
}
