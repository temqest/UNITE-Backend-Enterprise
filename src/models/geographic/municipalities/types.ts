export interface MunicipalityRow {
  id: string;
  org_id: string | null;
  district_id: string;
  province_id: string;
  name: string;
  code: string;
  created_at: string;
  updated_at: string;
}

export interface MunicipalityCreateInput {
  org_id?: string | null;
  district_id: string;
  province_id: string;
  name: string;
  code: string;
}

export interface MunicipalityUpdateInput {
  org_id?: string | null;
  district_id?: string;
  province_id?: string;
  name?: string;
  code?: string;
}
