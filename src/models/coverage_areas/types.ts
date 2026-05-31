export type CoverageAreaType = 'city' | 'municipality' | 'barangay' | 'district' | 'province';
export type CoverageStatus = 'active' | 'inactive' | 'archived';

export interface CoverageAreaRow {
  id: string;
  org_id: string;
  area_name: string;
  area_type: CoverageAreaType;
  status: CoverageStatus;
  
  psgc_code: string | null;
  geometry: any | null; // JSONB
  province: string | null;
  municipality: string | null;
  barangay: string | null;
  normalized_area_key: string | null;
  
  target_units: number;
  target_donors: number;
  collected_units: number;
  donor_count: number;
  successful_donations: number;
  deferred_donors: number;
  upcoming_events_count: number;
  last_campaign_date: string | null;
  notes: string | null;

  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}
