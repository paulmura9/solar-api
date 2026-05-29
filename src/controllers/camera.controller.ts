import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { HttpError } from '../utils/httpError';

interface CameraCaptureResponse {
  id: number;
  image_path: string;
  width: number | null;
  height: number | null;
  captured_at: string;
}

function rowToResponse(row: Record<string, unknown>): CameraCaptureResponse {
  return {
    id: row['id'] as number,
    image_path: row['image_path'] as string,
    width: (row['width'] as number | null) ?? null,
    height: (row['height'] as number | null) ?? null,
    captured_at: row['captured_at'] as string,
  };
}

const SELECT_FIELDS = 'id, image_path, width, height, captured_at';

export async function getLatestCapture(_req: Request, res: Response): Promise<void> {
  const { data, error } = await supabase
    .from('camera_captures')
    .select(SELECT_FIELDS)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('camera.controller', 'Failed to fetch latest camera capture', error);
    throw new HttpError(500, 'Failed to fetch latest camera capture');
  }

  res.json({
    data: data ? rowToResponse(data) : null,
    timestamp: new Date().toISOString(),
  });
}
