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
