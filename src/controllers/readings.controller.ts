import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { HttpError } from '../utils/httpError';
import { MS_PER_HOUR, HISTORY_MAX_POINTS, HISTORY_FETCH_CAP, HISTORY_PAGE_SIZE } from '../utils/constants';

interface ReadingResponse {
  id: number;
  timestamp: string;
  horizontal_angle: number;
  vertical_angle: number;
  tracking_mode: string;
  is_moving: boolean;
  ldr_top_left: number | null;
  ldr_top_right: number | null;
  ldr_bottom_left: number | null;
  ldr_bottom_right: number | null;
  horizontal_light_difference: number | null;
  vertical_light_difference: number | null;
  battery_voltage: number | null;
  battery_percent: number | null;
  battery_status: string | null;
  solar_voltage: number | null;
  solar_current: number | null;
  solar_power: number | null;
  solar_energy_today_wh: number | null;
  charging_voltage: number | null;
  charging_current: number | null;
  charging_power: number | null;
  charged_energy_today_wh: number | null;
  ambient_light_lux: number | null;
  created_at: string;
}

function rowToResponse(row: Record<string, unknown>): ReadingResponse {
  return {
    id: row['id'] as number,
    timestamp: row['timestamp'] as string,
    horizontal_angle: row['horizontal_angle'] as number,
    vertical_angle: row['vertical_angle'] as number,
    tracking_mode: row['tracking_mode'] as string,
    is_moving: row['is_moving'] as boolean,
    ldr_top_left: (row['ldr_top_left'] as number | null) ?? null,
    ldr_top_right: (row['ldr_top_right'] as number | null) ?? null,
    ldr_bottom_left: (row['ldr_bottom_left'] as number | null) ?? null,
    ldr_bottom_right: (row['ldr_bottom_right'] as number | null) ?? null,
    horizontal_light_difference: (row['horizontal_light_difference'] as number | null) ?? null,
    vertical_light_difference: (row['vertical_light_difference'] as number | null) ?? null,
    battery_voltage: (row['battery_voltage'] as number | null) ?? null,
    battery_percent: (row['battery_percent'] as number | null) ?? null,
    battery_status: (row['battery_status'] as string | null) ?? null,
    solar_voltage: (row['solar_voltage'] as number | null) ?? null,
    solar_current: (row['solar_current'] as number | null) ?? null,
    solar_power: (row['solar_power'] as number | null) ?? null,
    solar_energy_today_wh: (row['solar_energy_today_wh'] as number | null) ?? null,
    charging_voltage: (row['charging_voltage'] as number | null) ?? null,
    charging_current: (row['charging_current'] as number | null) ?? null,
    charging_power: (row['charging_power'] as number | null) ?? null,
    charged_energy_today_wh: (row['charged_energy_today_wh'] as number | null) ?? null,
    ambient_light_lux: (row['ambient_light_lux'] as number | null) ?? null,
    created_at: row['created_at'] as string,
  };
}

const SELECT_FIELDS = [
  'id', 'timestamp', 'horizontal_angle', 'vertical_angle', 'tracking_mode', 'is_moving',
  'ldr_top_left', 'ldr_top_right', 'ldr_bottom_left', 'ldr_bottom_right',
  'horizontal_light_difference', 'vertical_light_difference',
  'battery_voltage', 'battery_percent', 'battery_status',
  'solar_voltage', 'solar_current', 'solar_power', 'solar_energy_today_wh',
  'charging_voltage', 'charging_current', 'charging_power', 'charged_energy_today_wh',
  'ambient_light_lux', 'created_at',
].join(', ');

export async function getLatestReading(_req: Request, res: Response): Promise<void> {
  const { data, error } = await supabase
    .from('sensor_readings')
    .select(SELECT_FIELDS)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('readings.controller', 'Failed to fetch latest reading', error);
    throw new HttpError(500, 'Failed to fetch latest reading');
  }

  res.json({
    data: data ? rowToResponse(data as unknown as Record<string, unknown>) : null,
    timestamp: new Date().toISOString(),
  });
}

// Downsample, NOT an aggregate: real rows are returned unchanged (string
// fields like tracking_mode and battery_status stay valid), keeping every
// Nth row plus the first and last so the series spans the fetched window.
function downsampleRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (rows.length <= HISTORY_MAX_POINTS) return rows;
  const step = Math.ceil(rows.length / HISTORY_MAX_POINTS);
  const sampled: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length; i += step) sampled.push(rows[i]);
  const last = rows[rows.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

async function getWindowedHistory(res: Response, hours: number, limit: number): Promise<void> {
  const sinceIso = new Date(Date.now() - hours * MS_PER_HOUR).toISOString();

  // Page through the window newest-first (PostgREST caps a single response,
  // so one big .limit() cannot exceed the server page size). Trade-off: if
  // the window holds more than HISTORY_FETCH_CAP rows (~14h of continuous
  // 1 Hz telemetry), only the most recent HISTORY_FETCH_CAP are sampled —
  // acceptable for this single, intermittently-reporting device.
  const collected: Record<string, unknown>[] = [];
  while (collected.length < HISTORY_FETCH_CAP) {
    const from = collected.length;
    const to = Math.min(from + HISTORY_PAGE_SIZE, HISTORY_FETCH_CAP) - 1;
    const { data, error } = await supabase
      .from('sensor_readings')
      .select(SELECT_FIELDS)
      .gte('timestamp', sinceIso)
      .order('timestamp', { ascending: false })
      .range(from, to);

    if (error) {
      logger.error('readings.controller', 'Failed to fetch reading history', error);
      throw new HttpError(500, 'Failed to fetch reading history');
    }

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    collected.push(...rows);
    if (rows.length < to - from + 1) break; // window exhausted
  }

  const sampled = downsampleRows(collected);

  res.json({
    data: sampled.map(rowToResponse),
    total: sampled.length,
    limit,
    offset: 0,
    timestamp: new Date().toISOString(),
  });
}

export async function getReadingHistory(req: Request, res: Response): Promise<void> {
  const { limit, offset, start_date, end_date, hours } = req.query as {
    limit: string;
    offset: string;
    start_date?: string;
    end_date?: string;
    hours?: string;
  };

  // hours defines a rolling window ending now and takes precedence over
  // start_date/end_date and offset.
  if (hours !== undefined) {
    await getWindowedHistory(res, Number(hours), Number(limit));
    return;
  }

  let query = supabase
    .from('sensor_readings')
    .select(SELECT_FIELDS, { count: 'exact' })
    .order('timestamp', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (start_date) query = query.gte('timestamp', start_date);
  if (end_date) query = query.lte('timestamp', end_date);

  const { data, error, count } = await query;

  if (error) {
    logger.error('readings.controller', 'Failed to fetch reading history', error);
    throw new HttpError(500, 'Failed to fetch reading history');
  }

  res.json({
    data: (data ?? []).map((r) => rowToResponse(r as unknown as Record<string, unknown>)),
    total: count ?? 0,
    limit: Number(limit),
    offset: Number(offset),
    timestamp: new Date().toISOString(),
  });
}

export async function getReadingStats(req: Request, res: Response): Promise<void> {
  const hours = Number(req.query['hours'] ?? 24);
  const since = new Date(Date.now() - hours * MS_PER_HOUR).toISOString();

  const { data, error } = await supabase
    .from('sensor_readings')
    .select('solar_power, battery_voltage')
    .gte('timestamp', since);

  if (error) {
    logger.error('readings.controller', 'Failed to fetch reading stats', error);
    throw new HttpError(500, 'Failed to fetch reading stats');
  }

  const rows = data ?? [];
  const solarPowers = rows.map((r) => r.solar_power as number | null).filter((v): v is number => v !== null);
  const batteryVoltages = rows.map((r) => r.battery_voltage as number | null).filter((v): v is number => v !== null);

  function stats(arr: number[]): { min: number | null; max: number | null; avg: number | null } {
    if (arr.length === 0) return { min: null, max: null, avg: null };
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const avg = parseFloat((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2));
    return { min, max, avg };
  }

  res.json({
    hours,
    solar_power: stats(solarPowers),
    battery_voltage: stats(batteryVoltages),
    sample_count: rows.length,
    timestamp: new Date().toISOString(),
  });
}
