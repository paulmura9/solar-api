export const TRACKING_MODES = ['AUTO', 'MANUAL', 'IDLE', 'ERROR'] as const;
export const BATTERY_STATUSES = ['CHARGING', 'DISCHARGING', 'IDLE', 'LOW', 'UNKNOWN'] as const;
export const COMMAND_STATUSES = ['PENDING', 'SENT', 'ACKNOWLEDGED', 'FAILED'] as const;
export const SEVERITIES = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;
export const DEVICE_NAMES = ['ESP32', 'RASPBERRY_PI', 'MQTT_BROKER', 'CAMERA', 'INA219'] as const;

export const COMMAND_TYPES = [
  'SET_MODE',
  'MOVE_PANEL',
  'RESET_POSITION',
  'REQUEST_STATUS',
  'START_TRACKING',
  'STOP_TRACKING',
  'TRIGGER_CLEANING',
] as const;

export const EVENT_TYPES = [
  'BATTERY_LOW',
  'BATTERY_HIGH',
  'CLEANING_REQUIRED',
  'CLEANING_TRIGGERED',
  'TRACKING_STARTED',
  'TRACKING_STOPPED',
  'TRACKING_MODE_CHANGED',
  'SENSOR_ERROR',
  'CAMERA_ERROR',
  'ESP32_OFFLINE',
  'RASPBERRY_PI_OFFLINE',
  'DEVICE_OFFLINE',
  'MQTT_DISCONNECTED',
  'MQTT_CONNECTED',
  'COMMAND_TIMEOUT',
  'COMMAND_FAILED',
  'SUN_POSITION_UPDATE',
  'WEATHER_CHANGED',
] as const;

export const LDR_MIN = 0;
export const LDR_MAX = 4095;
export const SERVO_MIN = 0;
export const SERVO_MAX = 180;
export const BATTERY_PERCENT_MIN = 0;
export const BATTERY_PERCENT_MAX = 100;
export const BATTERY_VOLTAGE_MIN = 0;
export const BATTERY_VOLTAGE_MAX = 20;
export const DIRT_PERCENT_MIN = 0;
export const DIRT_PERCENT_MAX = 100;
export const CONFIDENCE_MIN = 0;
export const CONFIDENCE_MAX = 1;

export const HISTORY_DEFAULT_LIMIT = 100;
export const HISTORY_MAX_LIMIT = 1000;
export const EVENTS_DEFAULT_LIMIT = 20;
export const EVENTS_MAX_LIMIT = 100;
export const COMMANDS_DEFAULT_LIMIT = 20;
export const COMMANDS_MAX_LIMIT = 100;
export const VISION_DEFAULT_LIMIT = 50;
export const ENERGY_DEFAULT_DAYS = 7;
export const ENERGY_MAX_DAYS = 30;

export const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
export const OPEN_METEO_TIMEZONE = 'Europe/Bucharest';
export const OPEN_METEO_FORECAST_DAYS = 7;

export const BATTERY_CRITICAL_LOW_VOLTAGE = 6.0;
export const BATTERY_CRITICAL_HIGH_VOLTAGE = 9.0;
