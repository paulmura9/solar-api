export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

export interface DeepHealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  supabase: 'ok' | 'error';
  timestamp: string;
}

export interface ReadyHealthResponse {
  status: 'ready' | 'unavailable';
  supabase: 'connected' | 'unreachable';
  error?: string;
  timestamp: string;
}
