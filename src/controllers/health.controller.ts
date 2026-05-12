import { Request, Response } from 'express';
import { getDeepHealth, checkSupabaseHealth } from '../services/healthService';

export function getHealth(_req: Request, res: Response): void {
  res.json({
    status: 'ok',
    service: 'lighttrack-api',
    timestamp: new Date().toISOString(),
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
