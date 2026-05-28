import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import type { TelemetryPayload } from '../ws/schemas';

const RETURN_COLUMNS =
  'id, timestamp, horizontal_angle, vertical_angle, tracking_mode, is_moving, ldr_top_left, ldr_top_right, ldr_bottom_left, ldr_bottom_right, horizontal_light_difference, vertical_light_difference, battery_voltage, battery_percent, battery_status, solar_voltage, solar_current, solar_power, solar_energy_today_wh, charging_voltage, charging_current, charging_power, charged_energy_today_wh, ambient_light_lux, created_at';

export interface InsertedTelemetry {
  id: number;
  timestamp: string;
  horizontalAngle: number;
  verticalAngle: number;
  trackingMode: string;
  isMoving: boolean;
  ldrTopLeft: number | null;
  ldrTopRight: number | null;
  ldrBottomLeft: number | null;
  ldrBottomRight: number | null;
  horizontalLightDifference: number | null;
  verticalLightDifference: number | null;
  batteryVoltage: number;
  batteryPercent: number | null;
  batteryStatus: string | null;
  solarVoltage: number | null;
  solarCurrent: number | null;
  solarPower: number | null;
  solarEnergyTodayWh: number | null;
  chargingVoltage: number | null;
  chargingCurrent: number | null;
  chargingPower: number | null;
  chargedEnergyTodayWh: number | null;
  ambientLightLux: number | null;
  createdAt: string;
}

export async function insertTelemetry(payload: TelemetryPayload): Promise<InsertedTelemetry | null> {
  const row = {
    horizontal_angle: payload.horizontal_angle,
    vertical_angle: payload.vertical_angle,
    tracking_mode: payload.tracking_mode,
    is_moving: payload.is_moving,

    ldr_top_left: payload.ldr_top_left ?? null,
    ldr_top_right: payload.ldr_top_right ?? null,
    ldr_bottom_left: payload.ldr_bottom_left ?? null,
    ldr_bottom_right: payload.ldr_bottom_right ?? null,

    horizontal_light_difference: payload.horizontal_light_difference ?? null,
    vertical_light_difference: payload.vertical_light_difference ?? null,

    battery_voltage: payload.battery_voltage,
    battery_percent: payload.battery_percent ?? null,
    battery_status: payload.battery_status ?? null,

    solar_voltage: payload.solar_voltage ?? null,
    solar_current: payload.solar_current ?? null,
    solar_power: payload.solar_power ?? null,
    solar_energy_today_wh: payload.solar_energy_today_wh ?? null,

    charging_voltage: payload.charging_voltage ?? null,
    charging_current: payload.charging_current ?? null,
    charging_power: payload.charging_power ?? null,
    charged_energy_today_wh: payload.charged_energy_today_wh ?? null,

    ambient_light_lux: payload.ambient_light_lux ?? null,
  };

  const { data, error } = await supabase
    .from('sensor_readings')
    .insert(row)
    .select(RETURN_COLUMNS)
    .single();

  if (error || !data) {
    logger.error('telemetryService', 'Failed to insert sensor_reading', error);
    return null;
  }

  const r = data as Record<string, unknown>;
  return {
    id: r['id'] as number,
    timestamp: r['timestamp'] as string,
    horizontalAngle: r['horizontal_angle'] as number,
    verticalAngle: r['vertical_angle'] as number,
    trackingMode: r['tracking_mode'] as string,
    isMoving: r['is_moving'] as boolean,
    ldrTopLeft: (r['ldr_top_left'] as number | null) ?? null,
    ldrTopRight: (r['ldr_top_right'] as number | null) ?? null,
    ldrBottomLeft: (r['ldr_bottom_left'] as number | null) ?? null,
    ldrBottomRight: (r['ldr_bottom_right'] as number | null) ?? null,
    horizontalLightDifference: (r['horizontal_light_difference'] as number | null) ?? null,
    verticalLightDifference: (r['vertical_light_difference'] as number | null) ?? null,
    batteryVoltage: r['battery_voltage'] as number,
    batteryPercent: (r['battery_percent'] as number | null) ?? null,
    batteryStatus: (r['battery_status'] as string | null) ?? null,
    solarVoltage: (r['solar_voltage'] as number | null) ?? null,
    solarCurrent: (r['solar_current'] as number | null) ?? null,
    solarPower: (r['solar_power'] as number | null) ?? null,
    solarEnergyTodayWh: (r['solar_energy_today_wh'] as number | null) ?? null,
    chargingVoltage: (r['charging_voltage'] as number | null) ?? null,
    chargingCurrent: (r['charging_current'] as number | null) ?? null,
    chargingPower: (r['charging_power'] as number | null) ?? null,
    chargedEnergyTodayWh: (r['charged_energy_today_wh'] as number | null) ?? null,
    ambientLightLux: (r['ambient_light_lux'] as number | null) ?? null,
    createdAt: r['created_at'] as string,
  };
}
