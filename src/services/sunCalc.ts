function parseHHMMToMinutes(hhMM: string): number | null {
  const parts = hhMM.split(':');
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export function isDaylight(sunriseHHMM: string, sunsetHHMM: string): boolean {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const riseMinutes = parseHHMMToMinutes(sunriseHHMM);
  const setMinutes = parseHHMMToMinutes(sunsetHHMM);
  if (riseMinutes === null || setMinutes === null) return false;
  return nowMinutes >= riseMinutes && nowMinutes < setMinutes;
}

export function minutesUntilSunset(sunsetHHMM: string): number | null {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const setMinutes = parseHHMMToMinutes(sunsetHHMM);
  if (setMinutes === null) return null;
  const remaining = setMinutes - nowMinutes;
  return remaining > 0 ? remaining : 0;
}
