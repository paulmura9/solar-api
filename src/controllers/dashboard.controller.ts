import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

export async function getDashboardSummary(_req: Request, res: Response): Promise<void> {
  const [readingResult, visionResult, devicesResult, eventsResult] = await Promise.allSettled([
    supabase
      .from('sensor_readings')
      .select(`
        id, timestamp, horizontal_angle, vertical_angle,
        tracking_mode, is_moving,
        ldr_top_left, ldr_top_right, ldr_bottom_left, ldr_bottom_right,
        horizontal_light_difference, vertical_light_difference,
        battery_voltage, battery_percent, battery_status,
        solar_voltage, solar_current, solar_power, solar_energy_today_wh,
        charging_voltage, charging_current, charging_power, charged_energy_today_wh,
        ambient_light_lux, created_at
      `)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('vision_results')
      .select(`
        id, timestamp, dirt_level_percent, cleanliness_percent,
        cleaning_required, confidence, image_path, processed_image_path, created_at
      `)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('device_status')
      .select(`
        id, device_name, is_online, last_seen,
        firmware_version, status_message, updated_at
      `)
      .order('device_name', { ascending: true }),
    supabase
      .from('system_events')
      .select(`
        id, timestamp, event_type, severity, message, created_at
      `)
      .order('timestamp', { ascending: false })
      .limit(5),
  ]);

  function extractData<T>(result: PromiseSettledResult<{ data: T | null; error: unknown }>, label: string): T | null {
    if (result.status === 'rejected') {
      logger.error('dashboard.controller', `Failed to fetch ${label}`, result.reason);
      return null;
    }
    if (result.value.error) {
      logger.error('dashboard.controller', `Supabase error fetching ${label}`, result.value.error);
      return null;
    }
    return result.value.data ?? null;
  }

  const latestReading = extractData(readingResult as PromiseSettledResult<{ data: unknown | null; error: unknown }>, 'latest reading');
  const latestVision = extractData(visionResult as PromiseSettledResult<{ data: unknown | null; error: unknown }>, 'latest vision');
  const devicesRaw = extractData(devicesResult as PromiseSettledResult<{ data: unknown[] | null; error: unknown }>, 'device status');
  const eventsRaw = extractData(eventsResult as PromiseSettledResult<{ data: unknown[] | null; error: unknown }>, 'recent events');

  res.json({
    data: {
      latestReading,
      latestVision,
      devices: devicesRaw ?? [],
      recentEvents: eventsRaw ?? [],
    },
    timestamp: new Date().toISOString(),
  });
}
