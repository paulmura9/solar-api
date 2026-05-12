import { Request, Response } from 'express';
import { createCommand, getRecentCommands } from '../services/commandService';
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
  const { command_type, payload } = req.body as {
    command_type: CommandType;
    payload: Record<string, unknown>;
  };

  const command = await createCommand(command_type, payload);

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
