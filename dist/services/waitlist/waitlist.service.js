"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WaitlistService = void 0;
class WaitlistService {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async addToWaitlist(input) {
        try {
            const { data, error } = await this.supabase
                .from('waitlist')
                .insert([{ email: input.email.toLowerCase().trim() }])
                .select()
                .single();
            if (error) {
                if (error.code === '23505') { // Postgres unique constraint violation
                    return { error: { code: 'ALREADY_ON_WAITLIST', message: 'This email is already on the waitlist.' } };
                }
                return { error: { code: 'DATABASE_ERROR', message: 'Failed to add to waitlist', details: error } };
            }
            return { data: data };
        }
        catch (err) {
            return { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', details: err } };
        }
    }
}
exports.WaitlistService = WaitlistService;
