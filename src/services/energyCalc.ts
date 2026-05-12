import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import type { EnergySummaryDTO, DirtImpactDTO } from '../types/energy';

export async function getEnergySummary(days: number): Promise<EnergySummaryDTO> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from('sensor_readings')
    .select('solar_energy_today_wh, charged_energy_today_wh, solar_power')
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('energyCalc', 'Failed to fetch sensor_readings for energy summary', error);
    return {
      periodDays: days,
      totalGeneratedWh: 0,
      totalDeliveredWh: 0,
      efficiencyPercent: 0,
      currentPowerW: null,
    };
  }

  const rows = data ?? [];

  const maxGenerated = rows.reduce((max, r) => {
    const v = r.solar_energy_today_wh as number | null;
    return v !== null && v > max ? v : max;
  }, 0);

  const maxDelivered = rows.reduce((max, r) => {
    const v = r.charged_energy_today_wh as number | null;
    return v !== null && v > max ? v : max;
  }, 0);

  const currentPowerW = rows.length > 0 ? ((rows[0].solar_power as number | null) ?? null) : null;

  const efficiency =
    maxGenerated > 0 ? parseFloat(((maxDelivered / maxGenerated) * 100).toFixed(1)) : 0;

  return {
    periodDays: days,
    totalGeneratedWh: parseFloat(maxGenerated.toFixed(2)),
    totalDeliveredWh: parseFloat(maxDelivered.toFixed(2)),
    efficiencyPercent: efficiency,
    currentPowerW,
  };
}

export async function getDirtImpact(days: number): Promise<DirtImpactDTO> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from('vision_results')
    .select('dirt_level_percent')
    .gte('created_at', since);

  if (error) {
    logger.error('energyCalc', 'Failed to fetch vision_results for dirt impact', error);
    return { periodDays: days, avgDirtLevelPercent: 0, recommendation: 'No data available' };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return { periodDays: days, avgDirtLevelPercent: 0, recommendation: 'No vision data available for this period' };
  }

  const avg = rows.reduce((sum, r) => sum + (r.dirt_level_percent as number), 0) / rows.length;
  const avgRounded = parseFloat(avg.toFixed(1));

  const recommendation =
    avgRounded < 10
      ? 'Panel is clean — no cleaning required'
      : avgRounded < 25
      ? 'Moderate dirt detected — cleaning recommended soon'
      : 'High dirt level — immediate cleaning recommended';

  return { periodDays: days, avgDirtLevelPercent: avgRounded, recommendation };
}
