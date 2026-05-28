// unused — removal candidate
import { Request, Response } from 'express';
import { getEnergySummary, getDirtImpact } from '../services/energyCalc';

export async function getEnergySummaryHandler(req: Request, res: Response): Promise<void> {
  const days = Number(req.query['days'] ?? 7);
  const summary = await getEnergySummary(days);
  res.json({ data: summary, timestamp: new Date().toISOString() });
}

export async function getDirtImpactHandler(req: Request, res: Response): Promise<void> {
  const days = Number(req.query['days'] ?? 7);
  const impact = await getDirtImpact(days);
  res.json({ data: impact, timestamp: new Date().toISOString() });
}
