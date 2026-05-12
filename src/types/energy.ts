export interface EnergySummaryDTO {
  periodDays: number;
  totalGeneratedWh: number;
  totalDeliveredWh: number;
  efficiencyPercent: number;
  currentPowerW: number | null;
}

export interface DirtImpactDTO {
  periodDays: number;
  avgDirtLevelPercent: number;
  recommendation: string;
}
