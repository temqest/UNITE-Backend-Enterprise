import { RequestHandler } from 'express';

/**
 * Wrapper for async request handlers to properly catch errors
 * and pass them to Express error handling middleware
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
