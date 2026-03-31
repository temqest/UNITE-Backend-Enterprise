export interface DistrictRow {
  id: string;
  org_id: string | null;
  province_id: string;
  name: string;
  code: string;
  created_at: string;
  updated_at: string;
}

export interface DistrictCreateInput {
  org_id?: string | null;
  province_id: string;
  name: string;
  code: string;
}

export interface DistrictUpdateInput {
  org_id?: string | null;
  province_id?: string;
  name?: string;
  code?: string;
}
