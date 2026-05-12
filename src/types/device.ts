import type { DEVICE_NAMES } from '../utils/constants';

export type DeviceName = (typeof DEVICE_NAMES)[number];

export interface DeviceStatusDTO {
  id: number;
  deviceName: DeviceName;
  isOnline: boolean;
  lastSeen: string | null;
  firmwareVersion: string | null;
  statusMessage: string | null;
  updatedAt: string;
}

export interface DeviceStatusRow {
  id: number;
  device_name: string;
  is_online: boolean;
  last_seen: string | null;
  firmware_version: string | null;
  status_message: string | null;
  updated_at: string;
}
