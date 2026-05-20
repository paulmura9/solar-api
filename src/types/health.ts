export interface DeepHealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  supabase: 'ok' | 'error';
  timestamp: string;
}
