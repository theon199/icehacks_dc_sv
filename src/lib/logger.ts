/**
 * App logger. In development it prints to the console; in release builds nothing reaches the
 * console, entries are kept in a small in-memory ring buffer (useful for an in-app "report a
 * problem" flow) and forwarded to any registered sinks.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  at: number;
}

export type LogSink = (entry: LogEntry) => void;

const levelRank: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const BUFFER_SIZE = 100;

export interface LoggerOptions {
  /** Print to the console (development only). */
  console: boolean;
  /** Lowest level that is recorded. */
  minLevel: LogLevel;
  now?: () => number;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  addSink(sink: LogSink): () => void;
  recent(): readonly LogEntry[];
}

/** Turns unknown thrown values into something safe to log. */
export function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
}

export function createLogger(options: LoggerOptions): Logger {
  const buffer: LogEntry[] = [];
  const sinks = new Set<LogSink>();
  const now = options.now ?? Date.now;

  function write(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (levelRank[level] < levelRank[options.minLevel]) return;
    const entry: LogEntry = context ? { level, message, context, at: now() } : { level, message, at: now() };
    buffer.push(entry);
    if (buffer.length > BUFFER_SIZE) buffer.shift();
    for (const sink of sinks) {
      try {
        sink(entry);
      } catch {
        // A failing sink must never break the caller.
      }
    }
    if (options.console) {
      // eslint-disable-next-line no-console -- the logger is the single place allowed to print.
      const print = level === 'debug' ? console.log : console[level];
      if (context) print(`[famara] ${message}`, context);
      else print(`[famara] ${message}`);
    }
  }

  return {
    debug: (m, c) => write('debug', m, c),
    info: (m, c) => write('info', m, c),
    warn: (m, c) => write('warn', m, c),
    error: (m, c) => write('error', m, c),
    addSink(sink) {
      sinks.add(sink);
      return () => sinks.delete(sink);
    },
    recent: () => buffer.slice(),
  };
}

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
const isTest = process.env.NODE_ENV === 'test';

export const logger = createLogger({
  console: isDev && !isTest,
  minLevel: isDev ? 'debug' : 'info',
});
