import { Request, Response } from 'express';
import { getRecentEvents } from '../services/eventService';
import type { SystemEventDTO } from '../types/event';

function toResponse(dto: SystemEventDTO): object {
  return {
    id: dto.id,
    timestamp: dto.timestamp,
    event_type: dto.eventType,
    severity: dto.severity,
    message: dto.message,
    created_at: dto.createdAt,
  };
}

export async function getEvents(req: Request, res: Response): Promise<void> {
  const { limit, severity } = req.query as { limit: string; severity?: string };

  const events = await getRecentEvents(Number(limit), severity);

  res.json({
    data: events.map(toResponse),
    total: events.length,
    timestamp: new Date().toISOString(),
  });
}
