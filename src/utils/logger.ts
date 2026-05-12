type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatMessage(level: LogLevel, context: string, message: string): string {
  return `[${new Date().toISOString()}] [${level.toUpperCase()}] [${context}] ${message}`;
}

export const logger = {
  info(context: string, message: string): void {
    console.log(formatMessage('info', context, message));
  },
  warn(context: string, message: string): void {
    console.warn(formatMessage('warn', context, message));
  },
  error(context: string, message: string, err?: unknown): void {
    let errMsg = '';
    if (err instanceof Error) {
      errMsg = err.message;
    } else if (err !== null && err !== undefined && typeof err === 'object') {
      errMsg = JSON.stringify(err);
    } else if (err !== null && err !== undefined) {
      errMsg = String(err);
    }
    console.error(formatMessage('error', context, message), errMsg ? `| ${errMsg}` : '');
  },
  debug(context: string, message: string): void {
    if (process.env['NODE_ENV'] !== 'production') {
      console.debug(formatMessage('debug', context, message));
    }
  },
};
