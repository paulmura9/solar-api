import { env } from '../config/env';
import { logger } from '../utils/logger';
import { OPEN_METEO_BASE_URL, OPEN_METEO_TIMEZONE } from '../utils/constants';

export type WeatherCondition =
  | 'clear'
  | 'partly-cloudy'
  | 'overcast'
  | 'foggy'
  | 'rainy'
  | 'snowy'
  | 'unknown';

export interface CurrentWeather {
  condition: WeatherCondition;
  cloudCoverPercent: number;
  temperatureCelsius: number;
  precipitationProbabilityPercent: number;
  weatherCode: number;
}

interface OpenMeteoHourlyResponse {
  hourly: {
    time: string[];
    cloudcover: number[];
    precipitation_probability: number[];
    temperature_2m: number[];
    weathercode: number[];
  };
}

function classifyWeatherCode(code: number): WeatherCondition {
  if (code === 0) return 'clear';
  if (code >= 1 && code <= 2) return 'partly-cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'foggy';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'rainy';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snowy';
  return 'unknown';
}

export async function fetchCurrentWeather(): Promise<CurrentWeather | null> {
  try {
    const url = new URL(OPEN_METEO_BASE_URL);
    url.searchParams.set('latitude', String(env.LOCATION_LAT));
    url.searchParams.set('longitude', String(env.LOCATION_LON));
    url.searchParams.set('hourly', 'cloudcover,precipitation_probability,temperature_2m,weathercode');
    url.searchParams.set('timezone', OPEN_METEO_TIMEZONE);
    url.searchParams.set('forecast_days', '1');

    const response = await fetch(url.toString());

    if (!response.ok) {
      logger.warn('weatherService', `Open-Meteo responded with ${response.status}`);
      return null;
    }

    const json = (await response.json()) as OpenMeteoHourlyResponse;
    const { time, cloudcover, precipitation_probability, temperature_2m, weathercode } = json.hourly;

    const nowHour = new Date().getHours();
    const idx = time.findIndex((t) => new Date(t).getHours() === nowHour);
    const i = idx >= 0 ? idx : 0;

    return {
      condition: classifyWeatherCode(weathercode[i]),
      cloudCoverPercent: cloudcover[i],
      temperatureCelsius: temperature_2m[i],
      precipitationProbabilityPercent: precipitation_probability[i],
      weatherCode: weathercode[i],
    };
  } catch (err) {
    logger.error('weatherService', 'Failed to fetch current weather', err);
    return null;
  }
}
