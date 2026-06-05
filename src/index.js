const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const app = express();

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

app.use(helmet());
app.use(cors({
	origin(origin, callback) {
		if (!origin) {
			callback(null, true);
			return;
		}

		if (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production') {
			callback(null, true);
			return;
		}

		if (allowedOrigins.includes(origin)) {
			callback(null, true);
			return;
		}

		callback(new Error('Origin not allowed by CORS policy'));
	},
	credentials: true,
}));

// Trust proxy: required for rate limiting and IP detection behind reverse proxies (Render, Vercel, etc)
app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let v1Router = null;
let requestLoggerMiddleware = null;
let errorLogger = null;

try {
	if (process.env.NODE_ENV === 'development') {
		require('ts-node/register/transpile-only');
		({ v1Router } = require('./api/v1/routes/v1.routes.ts'));
		({ requestLoggerMiddleware } = require('./middleware/request-logger.middleware.ts'));
		({ errorLogger } = require('./utils/logger.ts'));
	} else {
		({ v1Router } = require('./api/v1/routes/v1.routes'));
		({ requestLoggerMiddleware } = require('./middleware/request-logger.middleware'));
		({ errorLogger } = require('./utils/logger'));
	}
} catch (primaryLoadError) {
	try {
		if (process.env.NODE_ENV === 'development') {
			({ v1Router } = require('./api/v1/routes/v1.routes'));
			({ requestLoggerMiddleware } = require('./middleware/request-logger.middleware'));
			({ errorLogger } = require('./utils/logger'));
		} else {
			require('ts-node/register/transpile-only');
			({ v1Router } = require('./api/v1/routes/v1.routes.ts'));
			({ requestLoggerMiddleware } = require('./middleware/request-logger.middleware.ts'));
			({ errorLogger } = require('./utils/logger.ts'));
		}
	} catch (runtimeError) {
		const primaryMessage = primaryLoadError instanceof Error ? primaryLoadError.message : String(primaryLoadError);
		const fallbackMessage = runtimeError instanceof Error ? runtimeError.message : String(runtimeError);
		console.warn('[bootstrap] API router was not loaded:', `${primaryMessage}; fallback: ${fallbackMessage}`);
	}
}

if (requestLoggerMiddleware) {
	app.use(requestLoggerMiddleware);
}

if (v1Router) {
	app.use('/api/v1', v1Router);
}

app.get('/health', (_req, res) => {
	res.status(200).json({ ok: true, service: 'UNITE Backend Enterprise' });
});

app.use((err, _req, res, _next) => {
	const message = err instanceof Error ? err.message : 'Internal server error';
	const details = process.env.NODE_ENV === 'production' ? undefined : err;

	if (errorLogger) {
		errorLogger.error({ err, req: _req }, 'Unhandled application error');
	} else {
		console.error(err);
	}

	const statusCode = err.statusCode || 500;
	res.status(statusCode).json({
		success: false,
		error: {
			code: err.code || 'INTERNAL_SERVER_ERROR',
			message,
			details,
		},
	});
});

module.exports = app;
