import { Request, Response } from 'express';
import { createAndDispatchCommand, getRecentCommands } from '../services/commandService';
import { isUserLinkedToDevice } from '../services/authorizationService';
import { env } from '../config/env';
import type { CommandType, DeviceCommandDTO } from '../types/command';

function toResponse(dto: DeviceCommandDTO): object {
  return {
    id: dto.id,
    command_type: dto.commandType,
    payload: dto.payload,
    status: dto.status,
    error_message: dto.errorMessage,
    created_at: dto.createdAt,
    sent_at: dto.sentAt,
    acknowledged_at: dto.acknowledgedAt,
  };
}

export async function postCommand(req: Request, res: Response): Promise<void> {
  const { command_type, payload, device_id } = req.body as {
    command_type: CommandType;
    payload: Record<string, unknown>;
    device_id?: string;
  };

  // Ownership gate on top of requireAuth: only a user linked to the target
  // device in user_devices may command it. Target resolution mirrors
  // createAndDispatchCommand exactly. The 403 body is identical whether or
  // not the device exists, so device ids cannot be enumerated.
  const targetDeviceId = device_id ?? env.DEFAULT_DEVICE_ID;
  const userId = req.user?.id;
  if (!userId || !(await isUserLinkedToDevice(userId, targetDeviceId))) {
    res.status(403).json({ error: 'You are not authorized to control this device' });
    return;
  }

  const command = await createAndDispatchCommand(command_type, payload, device_id);

  res.status(201).json({
    data: toResponse(command),
    timestamp: new Date().toISOString(),
  });
}

export async function getCommands(req: Request, res: Response): Promise<void> {
  const { limit, status } = req.query as { limit: string; status?: string };

  const commands = await getRecentCommands(Number(limit), status);

  res.json({
    data: commands.map(toResponse),
    total: commands.length,
    timestamp: new Date().toISOString(),
  });
}
