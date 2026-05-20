import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import type { TelemetryPayload } from '../ws/schemas';

const RETURN_COLUMNS =
  'id, timestamp, horizontal_angle, vertical_angle, tracking_mode, is_moving, battery_voltage, solar_power, created_at';

export interface InsertedTelemetry {
  id: number;
  timestamp: string;
  horizontalAngle: number;
  verticalAngle: number;
  trackingMode: string;
  isMoving: boolean;
  batteryVoltage: number;
  solarPower: number | null;
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
    batteryVoltage: r['battery_voltage'] as number,
    solarPower: (r['solar_power'] as number | null) ?? null,
    createdAt: r['created_at'] as string,
  };
}
