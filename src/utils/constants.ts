export const TRACKING_MODES = ['AUTO', 'MANUAL', 'NIGHT', 'IDLE', 'ERROR'] as const;
export const BATTERY_STATUSES = ['CHARGING', 'DISCHARGING', 'NORMAL', 'FULL', 'LOW', 'CRITICAL', 'IDLE', 'UNKNOWN'] as const;
export const COMMAND_STATUSES = ['PENDING', 'SENT', 'ACKNOWLEDGED', 'FAILED'] as const;
export const SEVERITIES = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;
export const DEVICE_NAMES = ['ESP32', 'RASPBERRY_PI', 'CAMERA', 'INA219'] as const;

export const COMMAND_TYPES = [
  'SET_MODE',
  'MOVE_PANEL',
  'RESET_POSITION',
  'REQUEST_STATUS',
  'START_TRACKING',
  'STOP_TRACKING',
  'TRIGGER_CLEANING',
] as const;

export const LDR_MIN = 0;
export const LDR_MAX = 4095;
export const BATTERY_PERCENT_MIN = 0;
export const BATTERY_PERCENT_MAX = 100;
export const DIRT_PERCENT_MIN = 0;
export const DIRT_PERCENT_MAX = 100;
export const CONFIDENCE_MIN = 0;
export const CONFIDENCE_MAX = 1;

export const HISTORY_DEFAULT_LIMIT = 100;
export const HISTORY_MAX_LIMIT = 1000;
export const EVENTS_DEFAULT_LIMIT = 20;
export const EVENTS_MAX_LIMIT = 100;
export const VISION_DEFAULT_LIMIT = 50;

export const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
export const OPEN_METEO_TIMEZONE = 'Europe/Bucharest';
export const OPEN_METEO_FORECAST_DAYS = 7;
