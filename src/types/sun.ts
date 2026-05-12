export interface SunScheduleRow {
  id: number;
  date: string;
  sunrise: string;
  sunset: string;
  daylight_hours: number;
  latitude: number;
  longitude: number;
  created_at: string;
  updated_at: string;
}

export interface SunScheduleDTO {
  date: string;
  sunrise: string;
  sunset: string;
  daylightHours: number;
}
