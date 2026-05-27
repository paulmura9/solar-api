import { insertEvent } from '../../services/eventService';
import { insertVisionResult } from '../../services/visionService';
import { broadcastVision } from '../broadcaster';
import { visionResultPayloadSchema } from '../schemas';
import { parseOr } from '../utils';

export async function handleVisionResult(payload: unknown): Promise<void> {
  const parsed = parseOr(visionResultPayloadSchema, payload, 'vision_result');
  if (!parsed.ok) return;

  const inserted = await insertVisionResult(parsed.data);
  if (!inserted) return;

  broadcastVision(inserted);
  if (inserted.cleaningRequired) {
    await insertEvent({
      event_type: 'CLEANING_REQUIRED',
      severity: 'WARNING',
      message: `Vision pipeline flagged cleaning required (dirt=${inserted.dirtLevelPercent}%)`,
    });
  }
}
