import { Request, Response } from 'express';
import { snapshotMetrics } from '../utils/metrics';

export function getMetrics(_req: Request, res: Response): void {
  res.json({
    data: snapshotMetrics(),
    timestamp: new Date().toISOString(),
  });
}
