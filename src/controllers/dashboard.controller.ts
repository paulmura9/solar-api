import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

export async function getDashboardSummary(_req: Request, res: Response): Promise<void> {
  const [readingResult, visionResult, devicesResult, eventsResult] = await Promise.allSettled([
    supabase
      .from('sensor_readings')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('vision_results')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('device_status')
      .select('*')
      .order('device_name', { ascending: true }),
    supabase
      .from('system_events')
      .select('*')
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
