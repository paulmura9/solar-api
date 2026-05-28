import { Request, Response } from 'express';
import { getAllDevices, getDeviceByName } from '../services/deviceService';
import { HttpError } from '../utils/httpError';
import { DEVICE_NAMES } from '../utils/constants';
import type { DeviceStatusDTO, DeviceName } from '../types/device';

function toResponse(dto: DeviceStatusDTO): object {
  return {
    id: dto.id,
    device_name: dto.deviceName,
    is_online: dto.isOnline,
    last_seen: dto.lastSeen,
    firmware_version: dto.firmwareVersion,
    status_message: dto.statusMessage,
    updated_at: dto.updatedAt,
  };
}

export async function getDevices(_req: Request, res: Response): Promise<void> {
  const devices = await getAllDevices();
  res.json({ data: devices.map(toResponse), timestamp: new Date().toISOString() });
}

// unused — removal candidate
export async function getDeviceLastSeen(req: Request, res: Response): Promise<void> {
  const rawDeviceName = req.params['device_name'];
  if (!(DEVICE_NAMES as readonly string[]).includes(rawDeviceName)) {
    throw new HttpError(400, `Invalid device name. Valid values: ${DEVICE_NAMES.join(', ')}`);
  }
  const deviceName = rawDeviceName as DeviceName;
  const device = await getDeviceByName(deviceName);

  if (!device) {
    throw new HttpError(404, `Device ${deviceName} not found`);
  }

  res.json({
    device_name: device.deviceName,
    is_online: device.isOnline,
    last_seen: device.lastSeen,
    timestamp: new Date().toISOString(),
  });
}
