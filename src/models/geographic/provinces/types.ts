export interface ProvinceRow {
  id: string;
  org_id: string | null;
  name: string;
  code: string;
  region: string;
  created_at: string;
  updated_at: string;
}

export interface ProvinceCreateInput {
  org_id?: string | null;
  name: string;
  code: string;
  region: string;
}

export interface ProvinceUpdateInput {
  org_id?: string | null;
  name?: string;
  code?: string;
  region?: string;
}
