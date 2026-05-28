import { Request, Response } from 'express';
import { getDeepHealth, checkSupabaseHealth } from '../services/healthService';
import { wsCounts } from '../ws/server';
import { SERVICE_NAME } from '../utils/constants';

export function getHealth(_req: Request, res: Response): void {
  const counts = wsCounts();
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    ws: {
      devices_connected: counts.devices,
      clients_connected: counts.clients,
    },
  });
}

export async function getDeepHealthHandler(_req: Request, res: Response): Promise<void> {
  const health = await getDeepHealth();
  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
}

export async function getReadyHandler(_req: Request, res: Response): Promise<void> {
  const supabaseStatus = await checkSupabaseHealth();

  if (supabaseStatus === 'ok') {
    res.status(200).json({
      status: 'ready',
      supabase: 'connected',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'unavailable',
      supabase: 'unreachable',
      error: 'Supabase health check failed',
      timestamp: new Date().toISOString(),
    });
  }
}
