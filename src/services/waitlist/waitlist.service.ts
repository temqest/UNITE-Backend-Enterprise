import { SupabaseClient } from '@supabase/supabase-js';
import { CreateWaitlistRecordInput, WaitlistRecord } from '../../models/waitlist/types';

export class WaitlistService {
  constructor(private readonly supabase: SupabaseClient) {}

  async addToWaitlist(input: CreateWaitlistRecordInput): Promise<{ data?: WaitlistRecord; error?: { code: string; message: string; details?: unknown } }> {
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

      return { data: data as WaitlistRecord };
    } catch (err) {
      return { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', details: err } };
    }
  }
}
