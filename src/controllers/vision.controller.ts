import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { HttpError } from '../utils/httpError';

interface VisionResponse {
  id: number;
  timestamp: string;
  dirt_level_percent: number;
  cleanliness_percent: number;
  cleaning_required: boolean;
  confidence: number | null;
  image_path: string | null;
  processed_image_path: string | null;
  predicted_class: string | null;
  quality_ok: boolean;
  quality_reason: string | null;
  created_at: string;
}

function rowToResponse(row: Record<string, unknown>): VisionResponse {
  return {
    id: row['id'] as number,
    timestamp: row['timestamp'] as string,
    dirt_level_percent: row['dirt_level_percent'] as number,
    cleanliness_percent: row['cleanliness_percent'] as number,
    cleaning_required: row['cleaning_required'] as boolean,
    confidence: (row['confidence'] as number | null) ?? null,
    image_path: (row['image_path'] as string | null) ?? null,
    processed_image_path: (row['processed_image_path'] as string | null) ?? null,
    predicted_class: (row['predicted_class'] as string | null) ?? null,
    quality_ok: row['quality_ok'] as boolean,
    quality_reason: (row['quality_reason'] as string | null) ?? null,
    created_at: row['created_at'] as string,
  };
}

const SELECT_FIELDS =
  'id, timestamp, dirt_level_percent, cleanliness_percent, cleaning_required, confidence, image_path, processed_image_path, predicted_class, quality_ok, quality_reason, created_at';

export async function getLatestVision(_req: Request, res: Response): Promise<void> {
  const { data, error } = await supabase
    .from('vision_results')
    .select(SELECT_FIELDS)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('vision.controller', 'Failed to fetch latest vision result', error);
    throw new HttpError(500, 'Failed to fetch latest vision result');
  }

  res.json({
    data: data ? rowToResponse(data) : null,
    timestamp: new Date().toISOString(),
  });
}

export async function getVisionHistory(req: Request, res: Response): Promise<void> {
  const { limit, start_date, end_date } = req.query as {
    limit: string;
    start_date?: string;
    end_date?: string;
  };

  let query = supabase
    .from('vision_results')
    .select(SELECT_FIELDS, { count: 'exact' })
    .order('timestamp', { ascending: false })
    .limit(Number(limit));

  if (start_date) query = query.gte('timestamp', start_date);
  if (end_date) query = query.lte('timestamp', end_date);

  const { data, error, count } = await query;

  if (error) {
    logger.error('vision.controller', 'Failed to fetch vision history', error);
    throw new HttpError(500, 'Failed to fetch vision history');
  }

  res.json({
    data: (data ?? []).map((r) => rowToResponse(r as Record<string, unknown>)),
    total: count ?? 0,
    timestamp: new Date().toISOString(),
  });
}
