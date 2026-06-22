import type { SEVERITIES } from '../utils/constants';

export type Severity = (typeof SEVERITIES)[number];

export interface SystemEventDTO {
  id: number;
  timestamp: string;
  eventType: string;
  severity: Severity;
  message: string;
  createdAt: string;
}

export interface InsertEventInput {
  event_type: string;
  severity: Severity;
  message: string;
  device_id?: string | null;
}
