// src/models/waitlist/types.ts

export interface WaitlistRecord {
  id: string;
  email: string;
  created_at: Date | string;
}

export interface CreateWaitlistRecordInput {
  email: string;
}
