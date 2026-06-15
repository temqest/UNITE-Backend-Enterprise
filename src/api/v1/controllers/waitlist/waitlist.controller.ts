import { Request, Response } from 'express';
import { supabaseServer } from '../../../../lib/supabase/supabase.client';
import { WaitlistService } from '../../../../services/waitlist/waitlist.service';

const waitlistService = new WaitlistService(supabaseServer);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function joinWaitlistController(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'A valid email address is required.' } });
      return;
    }

    const result = await waitlistService.addToWaitlist({ email });

    if (result.error) {
      if (result.error.code === 'ALREADY_ON_WAITLIST') {
        res.status(409).json({ success: false, error: result.error });
        return;
      }
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
}
