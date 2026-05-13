import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import type { EnergySummaryDTO, DirtImpactDTO } from '../types/energy';

export async function getEnergySummary(days: number): Promise<EnergySummaryDTO> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from('sensor_readings')
    .select('timestamp, solar_energy_today_wh, charged_energy_today_wh, solar_power')
    .gte('timestamp', since)
    .order('timestamp', { ascending: false });

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

  // solar_energy_today_wh resets daily. Sum the daily maximum per
  // calendar day to get the correct total over a multi-day period.
  const generatedByDay = new Map<string, number>();
  const deliveredByDay = new Map<string, number>();

  for (const row of rows) {
    const day = new Date(row.timestamp as string).toISOString().split('T')[0];
    const genVal = (row.solar_energy_today_wh as number | null) ?? 0;
    const delVal = (row.charged_energy_today_wh as number | null) ?? 0;
    if (genVal > (generatedByDay.get(day) ?? 0)) generatedByDay.set(day, genVal);
    if (delVal > (deliveredByDay.get(day) ?? 0)) deliveredByDay.set(day, delVal);
  }

  const totalGeneratedWh = Array.from(generatedByDay.values()).reduce((sum, v) => sum + v, 0);
  const totalDeliveredWh = Array.from(deliveredByDay.values()).reduce((sum, v) => sum + v, 0);
  const currentPowerW = rows.length > 0 ? ((rows[0].solar_power as number | null) ?? null) : null;

  const efficiency =
    totalGeneratedWh > 0 ? parseFloat(((totalDeliveredWh / totalGeneratedWh) * 100).toFixed(1)) : 0;

  return {
    periodDays: days,
    totalGeneratedWh: parseFloat(totalGeneratedWh.toFixed(2)),
    totalDeliveredWh: parseFloat(totalDeliveredWh.toFixed(2)),
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
