import type { COMMAND_TYPES, COMMAND_STATUSES } from '../utils/constants';

export type CommandType = (typeof COMMAND_TYPES)[number];
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

export interface DeviceCommandDTO {
  id: string;
  commandType: CommandType;
  payload: Record<string, unknown>;
  status: CommandStatus;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
  acknowledgedAt: string | null;
}

export interface CreateCommandInput {
  command_type: CommandType;
  payload: Record<string, unknown>;
}

export interface CommandRow {
  id: string;
  timestamp: string;
  command_type: string;
  payload: Record<string, unknown>;
  status: string;
  error_message: string | null;
  ack_payload: Record<string, unknown> | null;
  created_at: string;
  sent_at: string | null;
  acknowledged_at: string | null;
}
