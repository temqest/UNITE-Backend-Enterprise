const http = require('http');
const app = require('./index');

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const createRequestLogger = () => {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    const incomingRequestId = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'].trim() : '';
    const requestId = incomingRequestId || Math.random().toString(36).slice(2, 8);

    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);

    console.log(`[request:${requestId}] -> ${req.method} ${req.originalUrl || req.url}`);

    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      console.log(
        `[request:${requestId}] <- ${res.statusCode} ${req.method} ${req.originalUrl || req.url} (${elapsedMs.toFixed(1)}ms)`
      );
    });

    next();
  };
};

app.use(createRequestLogger());

const server = http.createServer(app);

const readEnv = (name) => {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

const resolveEnvSource = (...names) => {
  for (const name of names) {
    if (readEnv(name)) {
      return name;
    }
  }
  return undefined;
};

const getSupabaseProjectRef = () => {
  const configured = readEnv('SUPABASE_ID');
  if (configured) {
    return configured;
  }

  const url = readEnv('SUPABASE_URL');
  if (!url) {
    return 'unknown';
  }

  try {
    return new URL(url).hostname.split('.')[0] || 'unknown';
  } catch {
    return 'unknown';
  }
};

const getBrevoApiKey = () => {
  return readEnv('BREVO_API_KEY') || readEnv('SENDINBLUE_API_KEY');
};

const logBrevoStatus = async () => {
  const apiKey = getBrevoApiKey();
  const senderEmail = readEnv('BREVO_SENDER_EMAIL');
  const senderName = readEnv('BREVO_SENDER_NAME');

  if (!apiKey) {
    console.warn('[startup] Brevo: not connected (missing BREVO_API_KEY or SENDINBLUE_API_KEY)');
    return;
  }

  if (!senderEmail) {
    console.warn('[startup] Brevo: API key found but BREVO_SENDER_EMAIL is missing');
  }

  if (!senderName) {
    console.warn('[startup] Brevo: API key found but BREVO_SENDER_NAME is missing');
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/account', {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
      },
    });

    if (!response.ok) {
      let details = '';
      try {
        const body = await response.json();
        details = body?.message ? ` - ${body.message}` : '';
      } catch {
        details = '';
      }

      console.warn(`[startup] Brevo: API check failed (${response.status}${details})`);
      return;
    }

    console.log('[startup] Brevo: connected and API check passed');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[startup] Brevo: API check failed (network/runtime) - ${message}`);
  }
};

const logSupabaseStatus = () => {
  const hasUrl = Boolean(readEnv('SUPABASE_URL'));
  const hasAnonKey = Boolean(resolveEnvSource('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY'));
  const hasServiceKey = Boolean(resolveEnvSource(
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABSE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEY'
  ));

  if (hasUrl && hasAnonKey && hasServiceKey) {
    console.log(`[startup] Supabase: connected (${getSupabaseProjectRef()})`);
    return;
  }

  console.warn('[startup] Supabase: not connected (configuration incomplete)');
};

server.listen(PORT, () => {
  console.log(`[startup] Environment: ${NODE_ENV}`);
  logSupabaseStatus();
  void logBrevoStatus();
  console.log(`[server] Listening on port ${PORT}`);
});

let shutdownInProgress = false;
let forcedShutdownTimer = null;

const shutdown = (reason) => {
  if (shutdownInProgress) {
    return;
  }

  shutdownInProgress = true;

  if (!server.listening) {
    console.log(`[server] ${reason} received, server already closed.`);
    process.exit(0);
    return;
  }

  console.log(`[server] ${reason} received, shutting down gracefully...`);

  if (server.closeAllConnections) {
    server.closeAllConnections();
  }

  forcedShutdownTimer = setTimeout(() => {
    console.warn('[server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
  forcedShutdownTimer.unref();

  server.close((err) => {
    if (forcedShutdownTimer) {
      clearTimeout(forcedShutdownTimer);
      forcedShutdownTimer = null;
    }

    if (err) {
      console.error('[server] Error while shutting down:', err);
      process.exit(1);
      return;
    }

    console.log('[server] Shutdown complete.');
    process.exit(0);
  });
};

const handleExit = (reason) => {
  shutdown(reason || 'EXIT');
};

process.stdin.resume(); // Keep stdin flowing to detect closures
process.stdin.once('end', () => handleExit('stdin-end'));
process.stdin.once('close', () => handleExit('stdin-close'));
process.stdin.once('error', () => handleExit('stdin-error'));

process.once('SIGINT', () => handleExit('SIGINT'));
process.once('SIGTERM', () => handleExit('SIGTERM'));
process.once('SIGBREAK', () => handleExit('SIGBREAK')); // Windows Ctrl+Break
process.once('SIGHUP', () => handleExit('SIGHUP'));
process.once('SIGUSR2', () => handleExit('SIGUSR2')); // Nodemon restarts
process.once('disconnect', () => handleExit('disconnect'));
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
  handleExit('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled promise rejection:', reason);
  handleExit('unhandledRejection');
});

module.exports = server;
