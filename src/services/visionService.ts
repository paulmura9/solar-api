import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import type { VisionResultPayload } from '../ws/schemas';

const RETURN_COLUMNS =
  'id, timestamp, dirt_level_percent, cleanliness_percent, cleaning_required, confidence, image_path, processed_image_path, created_at';

export interface InsertedVisionResult {
  id: number;
  timestamp: string;
  dirtLevelPercent: number;
  cleanlinessPercent: number;
  cleaningRequired: boolean;
  confidence: number | null;
  imagePath: string | null;
  processedImagePath: string | null;
  createdAt: string;
}

export async function insertVisionResult(
  payload: VisionResultPayload
): Promise<InsertedVisionResult | null> {
  const row = {
    timestamp: payload.captured_at,
    dirt_level_percent: payload.dirt_level_percent,
    cleanliness_percent: payload.cleanliness_percent,
    cleaning_required: payload.cleaning_required,
    confidence: payload.confidence,
    image_path: payload.image_path,
    processed_image_path: payload.processed_image_path,
  };

  const { data, error } = await supabase
    .from('vision_results')
    .insert(row)
    .select(RETURN_COLUMNS)
    .single();

  if (error || !data) {
    logger.error('visionService', 'Failed to insert vision_result', error);
    return null;
  }

  const r = data as Record<string, unknown>;
  return {
    id: r['id'] as number,
    timestamp: r['timestamp'] as string,
    dirtLevelPercent: r['dirt_level_percent'] as number,
    cleanlinessPercent: r['cleanliness_percent'] as number,
    cleaningRequired: r['cleaning_required'] as boolean,
    confidence: (r['confidence'] as number | null) ?? null,
    imagePath: (r['image_path'] as string | null) ?? null,
    processedImagePath: (r['processed_image_path'] as string | null) ?? null,
    createdAt: r['created_at'] as string,
  };
}
