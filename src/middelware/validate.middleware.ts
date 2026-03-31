import { type Request, type Response, type NextFunction } from 'express';

interface ValidationResult {
  success: boolean;
  data?: unknown;
  error?: unknown;
}

interface Validator {
  validate: (payload: unknown) => ValidationResult;
}

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

type ValidationSource = 'body' | 'query' | 'params';

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

export function validateMiddleware(validator: Validator, source: ValidationSource = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const payload = source === 'query'
        ? (req.query ?? {})
        : source === 'params'
          ? (req.params ?? {})
          : (req.body ?? {});

      const result = validator.validate(payload);

      if (!result.success) {
        sendError(res, 400, {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          details: result.error,
        });
        return;
      }

      if (source === 'query') {
        req.query = result.data as Request['query'];
      } else if (source === 'params') {
        req.params = result.data as Request['params'];
      } else {
        req.body = result.data;
      }

      next();
    } catch (error) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: error,
      });
    }
  };
}

export default validateMiddleware;
