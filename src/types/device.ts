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
