import pino from 'pino';

// Define log levels and their transport destinations
const transport = pino.transport({
  targets: [
    {
      target: 'pino-pretty', // Console output for development and fast debugging
      level: 'info',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
    // In a real production setup, we'd add another target for a file or a logging service (Datadog/CloudWatch)
    // For now, we'll keep it fast and lightweight with just standard output, as requested.
  ],
});

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
  },
  transport
);

export const systemLogger = logger.child({ type: 'system' });
export const requestLogger = logger.child({ type: 'http_request' });
export const errorLogger = logger.child({ type: 'error' });
