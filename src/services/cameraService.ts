import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

const RETURN_COLUMNS = 'id, command_id, device_id, image_path, width, height, captured_at';

export interface InsertCameraCaptureInput {
  command_id: string;
  image_path: string;
  width: number | null;
  height: number | null;
  captured_at: string;
}

export interface InsertedCameraCapture {
  id: number;
  commandId: string;
  deviceId: string;
  imagePath: string;
  width: number | null;
  height: number | null;
  capturedAt: string;
}

export async function insertCameraCapture(
  input: InsertCameraCaptureInput
): Promise<InsertedCameraCapture | null> {
  const row = {
    command_id: input.command_id,
    image_path: input.image_path,
    width: input.width,
    height: input.height,
    captured_at: input.captured_at,
  };

  const { data, error } = await supabase
    .from('camera_captures')
    .insert(row)
    .select(RETURN_COLUMNS)
    .single();

  if (error || !data) {
    logger.error('cameraService', 'Failed to insert camera_capture', error);
    return null;
  }

  const r = data as Record<string, unknown>;
  return {
    id: r['id'] as number,
    commandId: r['command_id'] as string,
    deviceId: r['device_id'] as string,
    imagePath: r['image_path'] as string,
    width: (r['width'] as number | null) ?? null,
    height: (r['height'] as number | null) ?? null,
    capturedAt: r['captured_at'] as string,
  };
}
