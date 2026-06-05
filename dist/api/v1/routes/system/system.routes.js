"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemRouter = void 0;
const express_1 = require("express");
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const logger_1 = require("../../../../utils/logger");
exports.systemRouter = (0, express_1.Router)();
exports.systemRouter.get('/health', async (req, res) => {
    try {
        const startTime = process.uptime();
        // Check DB connection
        const { data, error } = await supabase_client_1.supabaseServer.from('users').select('id').limit(1);
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
    }
    catch (error) {
        logger_1.systemLogger.error({ err: error }, 'Health check failed');
        res.status(503).json({
            status: 'error',
            service: 'UNITE Backend Enterprise',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
