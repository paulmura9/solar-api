function writeLog(
  level: 'info' | 'warn' | 'error' | 'debug',
  context: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const entry: Record<string, unknown> = { level, ts: new Date().toISOString(), context, message, ...extra };
  const line = JSON.stringify(entry) + '\n';
  if (level === 'error') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

function serializeErr(err: unknown): Record<string, unknown> {
  if (err === undefined || err === null) return {};
  if (err instanceof Error) return { err: err.message };
  if (typeof err === 'string') return { err };
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    // Avoid overwriting the log entry's own 'message' key (e.g. Supabase errors carry message)
    if ('message' in obj) return { err: JSON.stringify(err) };
    return obj;
  }
  return { err: String(err) };
}

export const logger = {
  info(context: string, message: string): void {
    writeLog('info', context, message);
  },
  warn(context: string, message: string): void {
    writeLog('warn', context, message);
  },
  error(context: string, message: string, err?: unknown): void {
    writeLog('error', context, message, serializeErr(err));
  },
  debug(context: string, message: string): void {
    if (process.env['NODE_ENV'] !== 'production') {
      writeLog('debug', context, message);
    }
  },
};
