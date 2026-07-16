import { Router } from 'express';
import { supabaseServer as supabase } from '../../../../lib/supabase/supabase.client';
import { systemLogger } from '../../../../utils/logger';

export const systemRouter = Router();

systemRouter.get('/health', async (req, res) => {
  try {
    const startTime = process.uptime();
    
    // Check DB connection
    const { data, error } = await supabase.from('users').select('id').limit(1);
    
    if (error) {
      throw error;
    }

    const memoryUsage = process.memoryUsage();

    res.status(200).json({
      status: 'ok',
      service: 'UNITE Backend Enterprise',
      timestamp: new Date().toISOString(),
      uptime_seconds: startTime,
      database: 'connected',
      memory_usage: {
        rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
        heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      }
    });
  } catch (error) {
    systemLogger.error({ err: error }, 'Health check failed');
    res.status(503).json({
      status: 'error',
      service: 'UNITE Backend Enterprise',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

systemRouter.get('/keep-alive', async (req, res) => {
  try {
    // Perform a lightweight query to keep the database active
    const { data, error } = await supabase.from('users').select('id').limit(1);
    
    if (error) {
      throw error;
    }

    systemLogger.info('Keep-alive cron triggered successfully');

    res.status(200).json({
      status: 'success',
      message: 'Database keep-alive ping successful',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    systemLogger.error({ err: error }, 'Keep-alive ping failed');
    res.status(500).json({
      status: 'error',
      message: 'Database keep-alive ping failed',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
