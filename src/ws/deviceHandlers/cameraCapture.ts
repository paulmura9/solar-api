import { insertCameraCapture } from '../../services/cameraService';
import { acknowledgeCommand } from '../../services/commandService';
import { insertEvent } from '../../services/eventService';
import { broadcastCaptureComplete } from '../broadcaster';
import { cameraCaptureResultPayloadSchema } from '../schemas';
import { parseOr } from '../utils';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';
import { EVENT_TYPES } from '../../utils/constants';

interface CaptureCompletePayload {
  command_id: string;
  status: 'SUCCESS' | 'FAILED';
  image_path?: string;
  captured_at?: string;
}

export async function handleCameraCaptureResult(payload: unknown): Promise<void> {
  const parsed = parseOr(cameraCaptureResultPayloadSchema, payload, 'camera_capture_result');
  if (!parsed.ok) return;

  const data = parsed.data;
  const commandId = data.command_id;

  if (data.status === 'SUCCESS') {
    const inserted = await insertCameraCapture({
      command_id: commandId,
      device_id: data.device_id,
      image_path: data.image_path,
      width: data.width ?? null,
      height: data.height ?? null,
      captured_at: data.captured_at,
    });

    if (!inserted) {
      // The image physically exists in Storage; only the metadata row failed.
      // Acknowledge anyway so the command does not time out, and record the gap.
      logger.error(
        'ws.cameraCapture',
        `camera_captures insert failed for command ${commandId}; acknowledging anyway (image_path=${data.image_path})`
      );
    }

    const ackPayload = {
      capture_id: inserted?.id ?? null,
      image_path: inserted?.imagePath ?? data.image_path,
      width: inserted?.width ?? data.width ?? null,
      height: inserted?.height ?? data.height ?? null,
      captured_at: inserted?.capturedAt ?? data.captured_at,
    };

    const updated = await acknowledgeCommand(commandId, 'ACKNOWLEDGED', null, ackPayload);
    if (!updated) {
      await insertEvent({
        event_type: EVENT_TYPES.CAMERA_CAPTURE_ORPHANED,
        severity: 'WARNING',
        message: `Camera capture stored (id=${inserted?.id ?? 'none — insert failed'}) but command ${commandId} was unknown or already terminal`,
        device_id: data.device_id ?? env.DEFAULT_DEVICE_ID,
      });
    }

    const complete: CaptureCompletePayload = {
      command_id: commandId,
      status: 'SUCCESS',
      image_path: inserted?.imagePath ?? data.image_path,
      captured_at: inserted?.capturedAt ?? data.captured_at,
    };
    broadcastCaptureComplete(complete);
    return;
  }

  const errorMessage = data.error_message ?? 'Camera capture failed';
  const updated = await acknowledgeCommand(commandId, 'FAILED', errorMessage, null);
  if (!updated) {
    await insertEvent({
      event_type: EVENT_TYPES.CAMERA_CAPTURE_ORPHANED,
      severity: 'WARNING',
      message: `Camera capture FAILED report for unknown or already-terminal command ${commandId}`,
      device_id: data.device_id ?? env.DEFAULT_DEVICE_ID,
    });
  } else {
    await insertEvent({
      event_type: EVENT_TYPES.COMMAND_FAILED,
      severity: 'ERROR',
      message: `Camera capture command ${commandId} failed: ${errorMessage}`,
      device_id: updated.deviceId,
    });
  }

  const complete: CaptureCompletePayload = {
    command_id: commandId,
    status: 'FAILED',
  };
  broadcastCaptureComplete(complete);
}
