import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { OPEN_METEO_BASE_URL, OPEN_METEO_TIMEZONE, OPEN_METEO_FORECAST_DAYS } from '../utils/constants';
import type { SunScheduleDTO } from '../types/sun';

interface OpenMeteoDaily {
  time: string[];
  sunrise: string[];
  sunset: string[];
}

interface OpenMeteoResponse {
  daily: OpenMeteoDaily;
}

function parseDaylightHours(sunrise: string, sunset: string): number {
  const riseMs = new Date(sunrise).getTime();
  const setMs = new Date(sunset).getTime();
  if (Number.isNaN(riseMs) || Number.isNaN(setMs) || setMs <= riseMs) return 0;
  return parseFloat(((setMs - riseMs) / 3_600_000).toFixed(2));
}

function toTimeString(isoString: string): string {
  const d = new Date(isoString);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export async function fetchAndCacheSunSchedule(): Promise<void> {
  const url = new URL(OPEN_METEO_BASE_URL);
  url.searchParams.set('latitude', String(env.LOCATION_LAT));
  url.searchParams.set('longitude', String(env.LOCATION_LON));
  url.searchParams.set('daily', 'sunrise,sunset');
  url.searchParams.set('timezone', OPEN_METEO_TIMEZONE);
  url.searchParams.set('forecast_days', String(OPEN_METEO_FORECAST_DAYS));

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Open-Meteo responded with ${response.status}`);
  }

  const json = (await response.json()) as OpenMeteoResponse;
  const { time, sunrise, sunset } = json.daily;

  for (let i = 0; i < time.length; i++) {
    const date = time[i];
    const sunriseTime = toTimeString(sunrise[i]);
    const sunsetTime = toTimeString(sunset[i]);
    const daylightHours = parseDaylightHours(sunrise[i], sunset[i]);

    const { error } = await supabase.from('solar_schedule').upsert(
      {
        date,
        sunrise: sunriseTime,
        sunset: sunsetTime,
        daylight_hours: daylightHours,
        latitude: env.LOCATION_LAT,
        longitude: env.LOCATION_LON,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'date' }
    );

    if (error) {
      logger.error('openMeteo', `Failed to upsert solar_schedule for ${date}`, error);
    }
  }

  logger.info('openMeteo', `Cached ${time.length} days of sun schedule`);
}

export async function getTodaySunSchedule(): Promise<SunScheduleDTO | null> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('solar_schedule')
    .select('date, sunrise, sunset, daylight_hours')
    .eq('date', today)
    .maybeSingle();

  if (error) {
    logger.error('openMeteo', 'Failed to query solar_schedule', error);
    return null;
  }

  if (!data) return null;

  return {
    date: data.date as string,
    sunrise: data.sunrise as string,
    sunset: data.sunset as string,
    daylightHours: data.daylight_hours as number,
  };
}

export async function getWeekSunSchedule(): Promise<SunScheduleDTO[]> {
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('solar_schedule')
    .select('date, sunrise, sunset, daylight_hours')
    .gte('date', today)
    .lte('date', weekEnd)
    .order('date');

  if (error) {
    logger.error('openMeteo', 'Failed to query week sun schedule', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    date: row.date as string,
    sunrise: row.sunrise as string,
    sunset: row.sunset as string,
    daylightHours: row.daylight_hours as number,
  }));
}
