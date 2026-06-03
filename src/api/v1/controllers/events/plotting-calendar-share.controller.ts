import { PlottingCalendarShareService } from '../../../../services/events/plotting-calendar-share.service';
import { supabaseServer } from '../../../../lib/supabase/supabase.client';

interface Request {
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

interface Response {
  status: (code: number) => Response;
  json: (body: unknown) => void;
}

const plottingCalendarShareService = new PlottingCalendarShareService(supabaseServer);

function sendError(res: Response, statusCode: number, code: string, message: string, details?: unknown): void {
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
}

export async function getSharedPlottingCalendarController(req: Request, res: Response): Promise<void> {
  try {
    const shareToken = req.params?.shareToken;
    if (!shareToken) {
      sendError(res, 400, 'SHARE_TOKEN_REQUIRED', 'shareToken path parameter is required.');
      return;
    }

    const result = await plottingCalendarShareService.getSharedCalendar(shareToken);
    if (result.error || !result.data) {
      sendError(res, 404, result.error?.code ?? 'PLOTTING_CALENDAR_NOT_FOUND', result.error?.message ?? 'Plotting calendar not found.', result.error?.details);
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, 'PLOTTING_CALENDAR_GET_ERROR', 'Unexpected error while fetching shared plotting calendar.', error);
  }
}

export async function verifySharedPlottingCalendarAccessController(req: Request, res: Response): Promise<void> {
  try {
    const shareToken = req.params?.shareToken;
    if (!shareToken) {
      sendError(res, 400, 'SHARE_TOKEN_REQUIRED', 'shareToken path parameter is required.');
      return;
    }

    const result = await plottingCalendarShareService.verifyAccessCode(shareToken, req.body ?? {});
    if (result.error || !result.data) {
      sendError(res, 400, result.error?.code ?? 'PLOTTING_CALENDAR_VERIFY_FAILED', result.error?.message ?? 'Failed to verify access code.', result.error?.details);
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, 'PLOTTING_CALENDAR_VERIFY_ERROR', 'Unexpected error while verifying access code.', error);
  }
}

export async function getSharedPlottingCalendarAvailableSlotsController(req: Request, res: Response): Promise<void> {
  try {
    const shareToken = req.params?.shareToken;
    if (!shareToken) {
      sendError(res, 400, 'SHARE_TOKEN_REQUIRED', 'shareToken path parameter is required.');
      return;
    }

    const date = typeof req.query?.date === 'string' ? req.query.date : undefined;
    const accessCode = typeof req.query?.access_code === 'string' ? req.query.access_code : undefined;

    const result = await plottingCalendarShareService.getSharedCalendarAvailableSlots(shareToken, date, accessCode);
    if (result.error || !result.data) {
      sendError(res, 400, result.error?.code ?? 'PLOTTING_CALENDAR_SLOTS_FAILED', result.error?.message ?? 'Failed to calculate available slots.', result.error?.details);
      return;
    }

    // For public viewer, let's only return the day that was requested, or the whole availability structure.
    // The internal service returns a list of days.
    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, 'PLOTTING_CALENDAR_SLOTS_ERROR', 'Unexpected error while fetching available slots.', error);
  }
}

export async function plotEventFromSharedCalendarController(req: Request, res: Response): Promise<void> {
  try {
    const shareToken = req.params?.shareToken;
    if (!shareToken) {
      sendError(res, 400, 'SHARE_TOKEN_REQUIRED', 'shareToken path parameter is required.');
      return;
    }

    const result = await plottingCalendarShareService.plotEventPublic(shareToken, req.body ?? {});
    if (result.error || !result.data) {
      sendError(res, 400, result.error?.code ?? 'PLOT_EVENT_FAILED', result.error?.message ?? 'Failed to plot event.', result.error?.details);
      return;
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, 'PLOT_EVENT_ERROR', 'Unexpected error while plotting event.', error);
  }
}
