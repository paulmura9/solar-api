import type { TRACKING_MODES, BATTERY_STATUSES } from '../utils/constants';

export type TrackingMode = (typeof TRACKING_MODES)[number];
export type BatteryStatus = (typeof BATTERY_STATUSES)[number];

export interface ReadingHistoryQuery {
  limit: number;
  offset: number;
  start_date?: string;
  end_date?: string;
}
