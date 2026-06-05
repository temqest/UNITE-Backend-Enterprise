"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorLogger = exports.requestLogger = exports.systemLogger = exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
// Define log levels and their transport destinations
const transport = pino_1.default.transport({
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
exports.logger = (0, pino_1.default)({
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
    formatters: {
        level: (label) => {
            return { level: label.toUpperCase() };
        },
    },
}, transport);
exports.systemLogger = exports.logger.child({ type: 'system' });
exports.requestLogger = exports.logger.child({ type: 'http_request' });
exports.errorLogger = exports.logger.child({ type: 'error' });
