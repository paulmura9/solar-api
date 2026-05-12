import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { insertEvent } from './eventService';
import type { DeviceStatusDTO, DeviceName } from '../types/device';
import { env } from '../config/env';

export async function upsertDeviceStatus(
  deviceName: DeviceName,
  isOnline: boolean,
  firmwareVersion?: string | null,
  statusMessage?: string | null
): Promise<void> {
  const { error } = await supabase.from('device_status').upsert(
    {
      device_name: deviceName,
      is_online: isOnline,
      last_seen: new Date().toISOString(),
      firmware_version: firmwareVersion ?? null,
      status_message: statusMessage ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'device_name' }
  );

  if (error) {
    logger.error('deviceService', `Failed to upsert device_status for ${deviceName}`, error);
  }
}

export async function getAllDevices(): Promise<DeviceStatusDTO[]> {
  const { data, error } = await supabase
    .from('device_status')
    .select('id, device_name, is_online, last_seen, firmware_version, status_message, updated_at')
    .order('device_name');

  if (error) {
    logger.error('deviceService', 'Failed to fetch device statuses', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as number,
    deviceName: row.device_name as DeviceName,
    isOnline: row.is_online as boolean,
    lastSeen: (row.last_seen as string | null) ?? null,
    firmwareVersion: (row.firmware_version as string | null) ?? null,
    statusMessage: (row.status_message as string | null) ?? null,
    updatedAt: row.updated_at as string,
  }));
}

export async function getDeviceByName(deviceName: DeviceName): Promise<DeviceStatusDTO | null> {
  const { data, error } = await supabase
    .from('device_status')
    .select('id, device_name, is_online, last_seen, firmware_version, status_message, updated_at')
    .eq('device_name', deviceName)
    .maybeSingle();

  if (error) {
    logger.error('deviceService', `Failed to fetch device ${deviceName}`, error);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id as number,
    deviceName: data.device_name as DeviceName,
    isOnline: data.is_online as boolean,
    lastSeen: (data.last_seen as string | null) ?? null,
    firmwareVersion: (data.firmware_version as string | null) ?? null,
    statusMessage: (data.status_message as string | null) ?? null,
    updatedAt: data.updated_at as string,
  };
}

export async function markStaleDevicesOffline(): Promise<void> {
  const thresholdMs = env.DEVICE_OFFLINE_AFTER_SECONDS * 1000;
  const cutoff = new Date(Date.now() - thresholdMs).toISOString();

  const { data, error } = await supabase
    .from('device_status')
    .select('id, device_name, is_online, last_seen')
    .eq('is_online', true)
    .lt('last_seen', cutoff);

  if (error) {
    logger.error('deviceService', 'Failed to query stale devices', error);
    return;
  }

  for (const row of data ?? []) {
    const deviceName = row.device_name as string;
    const { error: updateError } = await supabase
      .from('device_status')
      .update({ is_online: false, updated_at: new Date().toISOString() })
      .eq('id', row.id);

    if (updateError) {
      logger.error('deviceService', `Failed to mark ${deviceName} offline`, updateError);
      continue;
    }

    logger.warn('deviceService', `${deviceName} marked offline (no heartbeat for ${env.DEVICE_OFFLINE_AFTER_SECONDS}s)`);

    const eventType = deviceName === 'ESP32'
      ? 'ESP32_OFFLINE'
      : deviceName === 'RASPBERRY_PI'
      ? 'RASPBERRY_PI_OFFLINE'
      : 'DEVICE_OFFLINE';

    await insertEvent({
      event_type: eventType,
      severity: 'WARNING',
      message: `${deviceName} offline (no heartbeat for ${env.DEVICE_OFFLINE_AFTER_SECONDS}s)`,
    });
  }
}
