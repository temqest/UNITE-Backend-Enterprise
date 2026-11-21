"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.joinWaitlistController = joinWaitlistController;
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const waitlist_service_1 = require("../../../../services/waitlist/waitlist.service");
const waitlistService = new waitlist_service_1.WaitlistService(supabase_client_1.supabaseServer);
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function joinWaitlistController(req, res) {
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
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
    }
}
