"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationQueueService = exports.NotificationQueueService = void 0;
const node_crypto_1 = require("node:crypto");
const supabase_client_1 = require("../../lib/supabase/supabase.client");
const utils_1 = require("./utils");
class NotificationQueueService {
    inMemoryQueue = [];
    overflowQueue = [];
    mergeWindowMs;
    supabase;
    isFlushing = false;
    constructor(params) {
        this.mergeWindowMs = (params?.mergeWindowMinutes ?? 5) * 60 * 1000;
        this.supabase = params?.supabase ?? supabase_client_1.supabaseServer;
    }
    async enqueue(payload, channel) {
        if (!payload.user_id) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('QUEUE_USER_REQUIRED', 'Queue enqueue requires a concrete user_id.'),
            };
        }
        if (this.shouldUseDbQueue(channel)) {
            return this.enqueueToDb(payload);
        }
        return this.enqueueInMemory(payload, channel);
    }
    enqueueInMemory(payload, channel) {
        const userId = payload.user_id;
        const limit = (0, utils_1.checkLimits)({
            org_id: payload.org_id,
            user_id: userId,
            channel,
            threshold: Number(process.env.NOTIFICATION_DAILY_LIMIT ?? 50),
        });
        const now = Date.now();
        const maxAttempts = Number(process.env.NOTIFICATION_MAX_RETRY ?? 3);
        const mergeCandidate = this.findMergeCandidate(payload.org_id, userId, payload.type, now);
        if (mergeCandidate) {
            const existingCountRaw = mergeCandidate.payload.data?.aggregate_count;
            const existingCount = typeof existingCountRaw === 'number' ? existingCountRaw : 1;
            const merged = (0, utils_1.mergeSimilar)({
                type: payload.type,
                incomingTitle: payload.title,
                incomingMessage: payload.message,
                existingAggregate: existingCount,
            });
            mergeCandidate.payload.title = merged.title;
            mergeCandidate.payload.message = merged.message;
            mergeCandidate.payload.data = {
                ...(mergeCandidate.payload.data ?? {}),
                ...(payload.data ?? {}),
                aggregate_count: merged.aggregate_count,
                merged_at: new Date(now).toISOString(),
            };
            if (!limit.allowed) {
                this.moveToOverflow(mergeCandidate.id);
            }
            return {
                data: {
                    job: mergeCandidate,
                    merged: true,
                    deferred: !limit.allowed,
                    aggregate_count: merged.aggregate_count,
                },
                error: null,
            };
        }
        const job = {
            id: (0, node_crypto_1.randomUUID)(),
            org_id: payload.org_id,
            user_id: userId,
            type: payload.type,
            created_at: now,
            run_after: now,
            payload: {
                ...payload,
                data: {
                    ...(payload.data ?? {}),
                    aggregate_count: 1,
                },
            },
            attempts: 0,
            max_attempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 3,
        };
        if (!limit.allowed) {
            this.overflowQueue.push(job);
            return {
                data: {
                    job,
                    merged: false,
                    deferred: true,
                },
                error: null,
            };
        }
        this.inMemoryQueue.push(job);
        return {
            data: {
                job,
                merged: false,
                deferred: false,
            },
            error: null,
        };
    }
    async enqueueToDb(payload) {
        const userId = payload.user_id;
        const now = Date.now();
        const maxAttemptsRaw = Number.parseInt(process.env.NOTIFICATION_MAX_RETRY ?? '', 10);
        const maxAttempts = Number.isFinite(maxAttemptsRaw) && maxAttemptsRaw > 0 ? maxAttemptsRaw : 3;
        const job = {
            id: (0, node_crypto_1.randomUUID)(),
            org_id: payload.org_id,
            user_id: userId,
            type: payload.type,
            created_at: now,
            run_after: now,
            payload: {
                ...payload,
                data: {
                    ...(payload.data ?? {}),
                    aggregate_count: 1,
                },
            },
            attempts: 0,
            max_attempts: maxAttempts,
        };
        const { error } = await this.supabase.from('notification_email_queue').insert({
            id: job.id,
            org_id: job.org_id,
            user_id: job.user_id,
            type: job.type,
            payload: job.payload,
            attempts: job.attempts,
            max_attempts: job.max_attempts,
            run_after: new Date(job.run_after).toISOString(),
            status: 'pending',
        });
        if (error) {
            // Fallback to memory queue to avoid dropping work if table is unavailable.
            const fallback = this.enqueueInMemory(payload, 'email');
            if (!fallback.data) {
                return {
                    data: null,
                    error: (0, utils_1.toServiceError)('QUEUE_DB_INSERT_FAILED', 'Failed to enqueue notification in persistent queue.', error),
                };
            }
            return {
                data: fallback.data,
                error: null,
            };
        }
        return {
            data: {
                job,
                merged: false,
                deferred: false,
            },
            error: null,
        };
    }
    async flush(onSend) {
        if (this.isFlushing) {
            return {
                data: {
                    processed: 0,
                    succeeded: 0,
                    failed: 0,
                    remaining: this.inMemoryQueue.length + this.overflowQueue.length,
                },
                error: null,
            };
        }
        this.isFlushing = true;
        let processed = 0;
        let succeeded = 0;
        let failed = 0;
        try {
            if (this.shouldUseDbQueue('email')) {
                const persistentResult = await this.flushDbQueue(onSend);
                if (persistentResult.error || !persistentResult.data) {
                    return { data: null, error: persistentResult.error };
                }
                processed += persistentResult.data.processed;
                succeeded += persistentResult.data.succeeded;
                failed += persistentResult.data.failed;
            }
            this.releaseOverflow();
            while (this.inMemoryQueue.length > 0) {
                const job = this.inMemoryQueue.shift();
                if (!job) {
                    break;
                }
                if (job.run_after > Date.now()) {
                    this.inMemoryQueue.push(job);
                    break;
                }
                processed += 1;
                try {
                    await onSend(job);
                    (0, utils_1.incrementLimitCounter)({ org_id: job.org_id, user_id: job.user_id, channel: 'email' });
                    succeeded += 1;
                }
                catch (error) {
                    job.attempts += 1;
                    if (job.attempts < job.max_attempts) {
                        job.run_after = Date.now() + job.attempts * 30_000;
                        this.inMemoryQueue.push(job);
                    }
                    else {
                        failed += 1;
                    }
                    if (process.env.NODE_ENV !== 'production') {
                        console.error('[notifications.queue] Job send failure:', {
                            job_id: job.id,
                            attempts: job.attempts,
                            error,
                        });
                    }
                }
            }
            return {
                data: {
                    processed,
                    succeeded,
                    failed,
                    remaining: this.inMemoryQueue.length + this.overflowQueue.length + (await this.getPendingDbCount()),
                },
                error: null,
            };
        }
        catch (error) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('QUEUE_FLUSH_FAILED', 'Failed while flushing notification queue.', error),
            };
        }
        finally {
            this.isFlushing = false;
        }
    }
    getPendingCount() {
        return this.inMemoryQueue.length;
    }
    getOverflowCount() {
        return this.overflowQueue.length;
    }
    shouldUseDbQueue(channel) {
        if (channel !== 'email') {
            return false;
        }
        const backend = (process.env.NOTIFICATION_QUEUE_BACKEND ?? 'table').toLowerCase();
        return backend === 'table' || backend === 'db';
    }
    toQueueJob(row) {
        return {
            id: row.id,
            org_id: row.org_id,
            user_id: row.user_id,
            type: row.type,
            payload: row.payload,
            attempts: row.attempts,
            max_attempts: row.max_attempts,
            created_at: new Date(row.created_at).getTime(),
            run_after: new Date(row.run_after).getTime(),
        };
    }
    sanitizeError(error) {
        if (error instanceof Error) {
            return `${error.name}: ${error.message}`;
        }
        if (typeof error === 'string') {
            return error;
        }
        return JSON.stringify(error);
    }
    async flushDbQueue(onSend) {
        const batchSizeRaw = Number.parseInt(process.env.NOTIFICATION_QUEUE_FLUSH_BATCH_SIZE ?? '', 10);
        const batchSize = Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? batchSizeRaw : 100;
        const nowIso = new Date().toISOString();
        const { data, error } = await this.supabase
            .from('notification_email_queue')
            .select('id, org_id, user_id, type, payload, attempts, max_attempts, run_after, status, created_at')
            .in('status', ['pending', 'retrying'])
            .lte('run_after', nowIso)
            .order('created_at', { ascending: true })
            .limit(batchSize);
        if (error) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('QUEUE_DB_FETCH_FAILED', 'Failed to fetch persistent queue jobs.', error),
            };
        }
        const jobs = (data ?? []).map((row) => this.toQueueJob(row));
        let processed = 0;
        let succeeded = 0;
        let failed = 0;
        for (const job of jobs) {
            processed += 1;
            try {
                await onSend(job);
                await this.supabase
                    .from('notification_email_queue')
                    .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                    .eq('id', job.id);
                (0, utils_1.incrementLimitCounter)({ org_id: job.org_id, user_id: job.user_id, channel: 'email' });
                succeeded += 1;
            }
            catch (errorSend) {
                const nextAttempts = job.attempts + 1;
                if (nextAttempts >= job.max_attempts) {
                    await this.supabase
                        .from('notification_email_queue')
                        .update({
                        attempts: nextAttempts,
                        status: 'failed',
                        last_error: this.sanitizeError(errorSend),
                        updated_at: new Date().toISOString(),
                    })
                        .eq('id', job.id);
                    failed += 1;
                }
                else {
                    await this.supabase
                        .from('notification_email_queue')
                        .update({
                        attempts: nextAttempts,
                        status: 'retrying',
                        run_after: new Date(Date.now() + nextAttempts * 30_000).toISOString(),
                        last_error: this.sanitizeError(errorSend),
                        updated_at: new Date().toISOString(),
                    })
                        .eq('id', job.id);
                }
            }
        }
        return {
            data: {
                processed,
                succeeded,
                failed,
                remaining: await this.getPendingDbCount(),
            },
            error: null,
        };
    }
    async getPendingDbCount() {
        if (!this.shouldUseDbQueue('email')) {
            return 0;
        }
        const { count, error } = await this.supabase
            .from('notification_email_queue')
            .select('id', { count: 'exact', head: true })
            .in('status', ['pending', 'retrying']);
        if (error) {
            return 0;
        }
        return count ?? 0;
    }
    findMergeCandidate(orgId, userId, type, now) {
        const candidate = this.inMemoryQueue.find((item) => {
            const withinWindow = now - item.created_at <= this.mergeWindowMs;
            return item.org_id === orgId && item.user_id === userId && item.type === type && withinWindow;
        });
        return candidate ?? null;
    }
    moveToOverflow(jobId) {
        const index = this.inMemoryQueue.findIndex((item) => item.id === jobId);
        if (index < 0) {
            return;
        }
        const [job] = this.inMemoryQueue.splice(index, 1);
        this.overflowQueue.push(job);
    }
    releaseOverflow() {
        if (this.overflowQueue.length === 0) {
            return;
        }
        const remaining = [];
        for (const job of this.overflowQueue) {
            const decision = (0, utils_1.checkLimits)({
                org_id: job.org_id,
                user_id: job.user_id,
                channel: 'email',
                threshold: Number(process.env.NOTIFICATION_DAILY_LIMIT ?? 50),
            });
            if (decision.allowed) {
                this.inMemoryQueue.push(job);
            }
            else {
                remaining.push(job);
            }
        }
        this.overflowQueue.splice(0, this.overflowQueue.length, ...remaining);
    }
}
exports.NotificationQueueService = NotificationQueueService;
exports.notificationQueueService = new NotificationQueueService();
