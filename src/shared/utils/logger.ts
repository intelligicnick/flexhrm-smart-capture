type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

const LOG_KEY = 'audit_logs';
const MAX_LOGS = 500;

export async function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): Promise<void> {
  const entry: LogEntry = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  };

  if (level === 'error') console.error('[FlexHRM]', message, context);
  else if (level === 'warn') console.warn('[FlexHRM]', message, context);
  else console.log('[FlexHRM]', message, context);

  try {
    const stored = await chrome.storage.local.get(LOG_KEY);
    const logs = (stored[LOG_KEY] as LogEntry[]) ?? [];
    logs.unshift(entry);
    await chrome.storage.local.set({ [LOG_KEY]: logs.slice(0, MAX_LOGS) });
  } catch {
    // Storage unavailable outside extension context
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
};
