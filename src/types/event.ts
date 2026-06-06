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
  // Owning device for the event. Omit (=> NULL) for system-level events
  // (server start, DB errors). Set for device-attributable events
  // (device offline/online, command failures, sensor/vision errors).
  device_id?: string | null;
}
