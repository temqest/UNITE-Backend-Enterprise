import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '../../lib/supabase/supabase.client';
import type {
  ProvinceCreateInput,
  ProvinceRow,
  ProvinceUpdateInput,
} from '../../models/geographic/provinces/types';
import type {
  DistrictCreateInput,
  DistrictRow,
  DistrictUpdateInput,
} from '../../models/geographic/districts/types';
import type {
  MunicipalityCreateInput,
  MunicipalityRow,
  MunicipalityUpdateInput,
} from '../../models/geographic/municipalities/types';

export interface ServiceError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ServiceResult<T> {
  data: T | null;
  error: ServiceError | null;
}

export interface GeographicSearchResult {
  type: 'province' | 'district' | 'municipality';
  id: string;
  code: string;
  name: string;
  province_id?: string;
  district_id?: string;
  region?: string;
}

export interface LocationHierarchyMunicipality {
  id: string;
  code: string;
  name: string;
}

export interface LocationHierarchyDistrict {
  id: string;
  code: string;
  name: string;
  municipalities: LocationHierarchyMunicipality[];
}

export interface LocationHierarchyProvince {
  id: string;
  code: string;
  name: string;
  region: string;
  districts: LocationHierarchyDistrict[];
}

function toServiceError(code: string, message: string, details?: unknown): ServiceError {
  return { code, message, details };
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function normalizeName(name: string): string {
  return name.trim();
}

function applyOrgScope<T extends { or: (filters: string) => T }>(query: T, orgId?: string | null): T {
  if (orgId && orgId.trim().length > 0) {
    return query.or(`org_id.is.null,org_id.eq.${orgId}`);
  }

  return query.or('org_id.is.null');
}

export class GeographicService {
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, { expiresAt: number; data: unknown }>();

  constructor(private readonly supabase: SupabaseClient = supabaseServer) {
    const ttlRaw = Number.parseInt(process.env.GEOGRAPHIC_CACHE_TTL_MS ?? '300000', 10);
    this.cacheTtlMs = Number.isFinite(ttlRaw) && ttlRaw >= 0 ? ttlRaw : 300000;
  }

  private getCacheKey(prefix: string, payload: unknown): string {
    return `${prefix}:${JSON.stringify(payload)}`;
  }

  private readCache<T>(key: string): T | null {
    if (this.cacheTtlMs <= 0) {
      return null;
    }

    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  private writeCache(key: string, data: unknown): void {
    if (this.cacheTtlMs <= 0) {
      return;
    }

    this.cache.set(key, {
      expiresAt: Date.now() + this.cacheTtlMs,
      data,
    });
  }

  private invalidateCache(prefix = ''): void {
    if (!prefix) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  async listProvinces(params: {
    org_id?: string;
    region?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ServiceResult<ProvinceRow[]>> {
    try {
      const cacheKey = this.getCacheKey('geo:listProvinces', params);
      const cached = this.readCache<ServiceResult<ProvinceRow[]>>(cacheKey);
      if (cached) {
        return cached;
      }

      let query = this.supabase
        .from('provinces')
        .select('*')
        .order('region', { ascending: true })
        .order('name', { ascending: true });

      query = applyOrgScope(query, params.org_id);

      if (params.region?.trim()) {
        query = query.ilike('region', params.region.trim());
      }

      if (params.search?.trim()) {
        const term = `%${params.search.trim()}%`;
        query = query.or(`name.ilike.${term},code.ilike.${term},region.ilike.${term}`);
      }

      if (typeof params.offset === 'number' && typeof params.limit === 'number') {
        query = query.range(params.offset, params.offset + params.limit - 1);
      } else if (typeof params.limit === 'number') {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;

      if (error) {
        return {
          data: null,
          error: toServiceError('PROVINCE_LIST_FAILED', 'Failed to fetch provinces.', error),
        };
      }

      const result = { data: (data ?? []) as ProvinceRow[], error: null };
      this.writeCache(cacheKey, result);
      return result;
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PROVINCE_LIST_ERROR', 'Unexpected error while listing provinces.', error),
      };
    }
  }

  async getProvinceById(orgId: string | undefined, id: string): Promise<ServiceResult<ProvinceRow>> {
    try {
      let query = this.supabase
        .from('provinces')
        .select('*')
        .eq('id', id);

      query = applyOrgScope(query, orgId);

      const { data, error } = await query.maybeSingle();

      if (error) {
        return {
          data: null,
          error: toServiceError('PROVINCE_FETCH_FAILED', 'Failed to fetch province.', error),
        };
      }

      if (!data) {
        return {
          data: null,
          error: toServiceError('PROVINCE_NOT_FOUND', 'Province not found.'),
        };
      }

      return { data: data as ProvinceRow, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PROVINCE_FETCH_ERROR', 'Unexpected error while fetching province.', error),
      };
    }
  }

  async createProvince(input: ProvinceCreateInput): Promise<ServiceResult<ProvinceRow>> {
    try {
      const payload = {
        org_id: input.org_id ?? null,
        name: normalizeName(input.name),
        code: normalizeCode(input.code),
        region: normalizeName(input.region),
      };

      const { data, error } = await this.supabase
        .from('provinces')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        return {
          data: null,
          error: toServiceError('PROVINCE_CREATE_FAILED', 'Failed to create province.', error),
        };
      }

      this.invalidateCache('geo:');
      return { data: data as ProvinceRow, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PROVINCE_CREATE_ERROR', 'Unexpected error while creating province.', error),
      };
    }
  }

  async updateProvince(id: string, input: ProvinceUpdateInput): Promise<ServiceResult<ProvinceRow>> {
    try {
      const updateData: Record<string, unknown> = {};

      if (input.org_id !== undefined) {
        updateData.org_id = input.org_id;
      }
      if (input.name !== undefined) {
        updateData.name = normalizeName(input.name);
      }
      if (input.code !== undefined) {
        updateData.code = normalizeCode(input.code);
      }
      if (input.region !== undefined) {
        updateData.region = normalizeName(input.region);
      }

      const { data, error } = await this.supabase
        .from('provinces')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) {
        return {
          data: null,
          error: toServiceError('PROVINCE_UPDATE_FAILED', 'Failed to update province.', error),
        };
      }

      if (!data) {
        return {
          data: null,
          error: toServiceError('PROVINCE_NOT_FOUND', 'Province not found.'),
        };
      }

      this.invalidateCache('geo:');
      return { data: data as ProvinceRow, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PROVINCE_UPDATE_ERROR', 'Unexpected error while updating province.', error),
      };
    }
  }

  async deleteProvince(id: string): Promise<ServiceResult<{ deleted: boolean }>> {
    try {
      const { error } = await this.supabase
        .from('provinces')
        .delete()
        .eq('id', id);

      if (error) {
        return {
          data: null,
          error: toServiceError('PROVINCE_DELETE_FAILED', 'Failed to delete province.', error),
        };
      }

      this.invalidateCache('geo:');
      return { data: { deleted: true }, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PROVINCE_DELETE_ERROR', 'Unexpected error while deleting province.', error),
      };
    }
  }

  async getProvincesByRegion(orgId: string | undefined, region: string): Promise<ServiceResult<ProvinceRow[]>> {
    return this.listProvinces({ org_id: orgId, region });
  }

  async listDistricts(params: {
    org_id?: string;
    province_id?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ServiceResult<DistrictRow[]>> {
    try {
      const cacheKey = this.getCacheKey('geo:listDistricts', params);
      const cached = this.readCache<ServiceResult<DistrictRow[]>>(cacheKey);
      if (cached) {
        return cached;
      }

      let query = this.supabase
        .from('districts')
        .select('*')
        .order('name', { ascending: true });

      query = applyOrgScope(query, params.org_id);

      if (params.province_id) {
        query = query.eq('province_id', params.province_id);
      }

      if (params.search?.trim()) {
        const term = `%${params.search.trim()}%`;
        query = query.or(`name.ilike.${term},code.ilike.${term}`);
      }

      if (typeof params.offset === 'number' && typeof params.limit === 'number') {
        query = query.range(params.offset, params.offset + params.limit - 1);
      } else if (typeof params.limit === 'number') {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;

      if (error) {
        return {
          data: null,
          error: toServiceError('DISTRICT_LIST_FAILED', 'Failed to fetch districts.', error),
        };
      }

      const result = { data: (data ?? []) as DistrictRow[], error: null };
      this.writeCache(cacheKey, result);
      return result;
    } catch (error) {
      return {
        data: null,
        error: toServiceError('DISTRICT_LIST_ERROR', 'Unexpected error while listing districts.', error),
      };
    }
  }

  async getDistrictById(orgId: string | undefined, id: string): Promise<ServiceResult<DistrictRow>> {
    try {
      let query = this.supabase
        .from('districts')
        .select('*')
        .eq('id', id);

      query = applyOrgScope(query, orgId);

      const { data, error } = await query.maybeSingle();

      if (error) {
        return {
          data: null,
          error: toServiceError('DISTRICT_FETCH_FAILED', 'Failed to fetch district.', error),
        };
      }

      if (!data) {
        return {
          data: null,
          error: toServiceError('DISTRICT_NOT_FOUND', 'District not found.'),
        };
      }

      return { data: data as DistrictRow, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('DISTRICT_FETCH_ERROR', 'Unexpected error while fetching district.', error),
      };
    }
  }

  async createDistrict(input: DistrictCreateInput): Promise<ServiceResult<DistrictRow>> {
    try {
      const payload = {
        org_id: input.org_id ?? null,
        province_id: input.province_id,
        name: normalizeName(input.name),
        code: normalizeCode(input.code),
      };

      const { data, error } = await this.supabase
        .from('districts')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        return {
          data: null,
          error: toServiceError('DISTRICT_CREATE_FAILED', 'Failed to create district.', error),
        };
      }

      this.invalidateCache('geo:');
      return { data: data as DistrictRow, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('DISTRICT_CREATE_ERROR', 'Unexpected error while creating district.', error),
      };
    }
  }

  async updateDistrict(id: string, input: DistrictUpdateInput): Promise<ServiceResult<DistrictRow>> {
    try {
      const updateData: Record<string, unknown> = {};

      if (input.org_id !== undefined) {
        updateData.org_id = input.org_id;
      }
      if (input.province_id !== undefined) {
        updateData.province_id = input.province_id;
      }
      if (input.name !== undefined) {
        updateData.name = normalizeName(input.name);
      }
      if (input.code !== undefined) {
        updateData.code = normalizeCode(input.code);
      }

      const { data, error } = await this.supabase
        .from('districts')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) {
        return {
          data: null,
          error: toServiceError('DISTRICT_UPDATE_FAILED', 'Failed to update district.', error),
        };
      }

      if (!data) {
        return {
          data: null,
          error: toServiceError('DISTRICT_NOT_FOUND', 'District not found.'),
        };
      }

      this.invalidateCache('geo:');
      return { data: data as DistrictRow, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('DISTRICT_UPDATE_ERROR', 'Unexpected error while updating district.', error),
      };
    }
  }

  async deleteDistrict(id: string): Promise<ServiceResult<{ deleted: boolean }>> {
    try {
      const { error } = await this.supabase
        .from('districts')
        .delete()
        .eq('id', id);

      if (error) {
        return {
          data: null,
          error: toServiceError('DISTRICT_DELETE_FAILED', 'Failed to delete district.', error),
        };
      }

      this.invalidateCache('geo:');
      return { data: { deleted: true }, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('DISTRICT_DELETE_ERROR', 'Unexpected error while deleting district.', error),
      };
    }
  }

  async getDistrictsByProvince(orgId: string | undefined, provinceId: string): Promise<ServiceResult<DistrictRow[]>> {
    return this.listDistricts({ org_id: orgId, province_id: provinceId });
  }

  async listMunicipalities(params: {
    org_id?: string;
    province_id?: string;
    district_id?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ServiceResult<MunicipalityRow[]>> {
    try {
      const cacheKey = this.getCacheKey('geo:listMunicipalities', params);
      const cached = this.readCache<ServiceResult<MunicipalityRow[]>>(cacheKey);
      if (cached) {
        return cached;
      }

      let query = this.supabase
        .from('municipalities')
        .select('*')
        .order('name', { ascending: true });

      query = applyOrgScope(query, params.org_id);

      if (params.province_id) {
        query = query.eq('province_id', params.province_id);
      }

      if (params.district_id) {
        query = query.eq('district_id', params.district_id);
      }

      if (params.search?.trim()) {
        const term = `%${params.search.trim()}%`;
        query = query.or(`name.ilike.${term},code.ilike.${term}`);
      }

      if (typeof params.offset === 'number' && typeof params.limit === 'number') {
        query = query.range(params.offset, params.offset + params.limit - 1);
      } else if (typeof params.limit === 'number') {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;

      if (error) {
        return {
          data: null,
          error: toServiceError('MUNICIPALITY_LIST_FAILED', 'Failed to fetch municipalities.', error),
        };
      }

      const result = { data: (data ?? []) as MunicipalityRow[], error: null };
      this.writeCache(cacheKey, result);
      return result;
    } catch (error) {
      return {
        data: null,
        error: toServiceError('MUNICIPALITY_LIST_ERROR', 'Unexpected error while listing municipalities.', error),
      };
    }
  }

  async getMunicipalityById(orgId: string | undefined, id: string): Promise<ServiceResult<MunicipalityRow>> {
    try {
      let query = this.supabase
        .from('municipalities')
        .select('*')
        .eq('id', id);

      query = applyOrgScope(query, orgId);

      const { data, error } = await query.maybeSingle();

      if (error) {
        return {
          data: null,
          error: toServiceError('MUNICIPALITY_FETCH_FAILED', 'Failed to fetch municipality.', error),
        };
      }

      if (!data) {
        return {
          data: null,
          error: toServiceError('MUNICIPALITY_NOT_FOUND', 'Municipality not found.'),
        };
      }

      return { data: data as MunicipalityRow, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('MUNICIPALITY_FETCH_ERROR', 'Unexpected error while fetching municipality.', error),
      };
    }
  }

  async createMunicipality(input: MunicipalityCreateInput): Promise<ServiceResult<MunicipalityRow>> {
    try {
      const payload = {
        org_id: input.org_id ?? null,
        district_id: input.district_id,
        province_id: input.province_id,
        name: normalizeName(input.name),
        code: normalizeCode(input.code),
      };

      const { data, error } = await this.supabase
        .from('municipalities')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        return {
          data: null,
          error: toServiceError('MUNICIPALITY_CREATE_FAILED', 'Failed to create municipality.', error),
        };
      }

      this.invalidateCache('geo:');
      return { data: data as MunicipalityRow, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('MUNICIPALITY_CREATE_ERROR', 'Unexpected error while creating municipality.', error),
      };
    }
  }

  async updateMunicipality(id: string, input: MunicipalityUpdateInput): Promise<ServiceResult<MunicipalityRow>> {
    try {
      const updateData: Record<string, unknown> = {};

      if (input.org_id !== undefined) {
        updateData.org_id = input.org_id;
      }
      if (input.district_id !== undefined) {
        updateData.district_id = input.district_id;
      }
      if (input.province_id !== undefined) {
        updateData.province_id = input.province_id;
      }
      if (input.name !== undefined) {
        updateData.name = normalizeName(input.name);
      }
      if (input.code !== undefined) {
        updateData.code = normalizeCode(input.code);
      }

      const { data, error } = await this.supabase
        .from('municipalities')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) {
        return {
          data: null,
          error: toServiceError('MUNICIPALITY_UPDATE_FAILED', 'Failed to update municipality.', error),
        };
      }

      if (!data) {
        return {
          data: null,
          error: toServiceError('MUNICIPALITY_NOT_FOUND', 'Municipality not found.'),
        };
      }

      this.invalidateCache('geo:');
      return { data: data as MunicipalityRow, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('MUNICIPALITY_UPDATE_ERROR', 'Unexpected error while updating municipality.', error),
      };
    }
  }

  async deleteMunicipality(id: string): Promise<ServiceResult<{ deleted: boolean }>> {
    try {
      const { error } = await this.supabase
        .from('municipalities')
        .delete()
        .eq('id', id);

      if (error) {
        return {
          data: null,
          error: toServiceError('MUNICIPALITY_DELETE_FAILED', 'Failed to delete municipality.', error),
        };
      }

      this.invalidateCache('geo:');
      return { data: { deleted: true }, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('MUNICIPALITY_DELETE_ERROR', 'Unexpected error while deleting municipality.', error),
      };
    }
  }

  async getMunicipalitiesByDistrict(orgId: string | undefined, districtId: string): Promise<ServiceResult<MunicipalityRow[]>> {
    return this.listMunicipalities({ org_id: orgId, district_id: districtId });
  }

  async searchLocation(params: {
    org_id?: string;
    term: string;
    limit?: number;
  }): Promise<ServiceResult<GeographicSearchResult[]>> {
    try {
      const cacheKey = this.getCacheKey('geo:searchLocation', params);
      const cached = this.readCache<ServiceResult<GeographicSearchResult[]>>(cacheKey);
      if (cached) {
        return cached;
      }

      const trimmed = params.term.trim();
      if (!trimmed) {
        return { data: [], error: null };
      }

      const resultLimit = params.limit ?? 20;

      const provincesPromise = this.listProvinces({
        org_id: params.org_id,
        search: trimmed,
        limit: resultLimit,
      });

      const districtsPromise = this.listDistricts({
        org_id: params.org_id,
        search: trimmed,
        limit: resultLimit,
      });

      const municipalitiesPromise = this.listMunicipalities({
        org_id: params.org_id,
        search: trimmed,
        limit: resultLimit,
      });

      const [provincesResult, districtsResult, municipalitiesResult] = await Promise.all([
        provincesPromise,
        districtsPromise,
        municipalitiesPromise,
      ]);

      if (provincesResult.error) {
        return { data: null, error: provincesResult.error };
      }
      if (districtsResult.error) {
        return { data: null, error: districtsResult.error };
      }
      if (municipalitiesResult.error) {
        return { data: null, error: municipalitiesResult.error };
      }

      const provinces = (provincesResult.data ?? []).map((row) => ({
        type: 'province' as const,
        id: row.id,
        code: row.code,
        name: row.name,
        region: row.region,
      }));

      const districts = (districtsResult.data ?? []).map((row) => ({
        type: 'district' as const,
        id: row.id,
        code: row.code,
        name: row.name,
        province_id: row.province_id,
      }));

      const municipalities = (municipalitiesResult.data ?? []).map((row) => ({
        type: 'municipality' as const,
        id: row.id,
        code: row.code,
        name: row.name,
        district_id: row.district_id,
        province_id: row.province_id,
      }));

      const merged = [...provinces, ...districts, ...municipalities]
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, resultLimit);

      const result = { data: merged, error: null };
      this.writeCache(cacheKey, result);
      return result;
    } catch (error) {
      return {
        data: null,
        error: toServiceError('LOCATION_SEARCH_ERROR', 'Unexpected error while searching locations.', error),
      };
    }
  }

  async getLocationHierarchy(params: {
    org_id?: string;
    province_id?: string;
  }): Promise<ServiceResult<LocationHierarchyProvince[]>> {
    try {
      const cacheKey = this.getCacheKey('geo:getLocationHierarchy', params);
      const cached = this.readCache<ServiceResult<LocationHierarchyProvince[]>>(cacheKey);
      if (cached) {
        return cached;
      }

      const provincesResult = await this.listProvinces({
        org_id: params.org_id,
        limit: 500,
      });

      if (provincesResult.error || !provincesResult.data) {
        return {
          data: null,
          error: provincesResult.error ?? toServiceError('PROVINCE_LIST_FAILED', 'Failed to fetch provinces.'),
        };
      }

      const provinces = params.province_id
        ? provincesResult.data.filter((province) => province.id === params.province_id)
        : provincesResult.data;

      const provinceIds = provinces.map((province) => province.id);
      if (provinceIds.length === 0) {
        return { data: [], error: null };
      }

      const districtsResult = await this.listDistricts({
        org_id: params.org_id,
        limit: 1000,
      });

      if (districtsResult.error || !districtsResult.data) {
        return {
          data: null,
          error: districtsResult.error ?? toServiceError('DISTRICT_LIST_FAILED', 'Failed to fetch districts.'),
        };
      }

      const filteredDistricts = districtsResult.data.filter((district) => provinceIds.includes(district.province_id));
      const districtIds = filteredDistricts.map((district) => district.id);

      const municipalitiesResult = await this.listMunicipalities({
        org_id: params.org_id,
        limit: 5000,
      });

      if (municipalitiesResult.error || !municipalitiesResult.data) {
        return {
          data: null,
          error: municipalitiesResult.error ?? toServiceError('MUNICIPALITY_LIST_FAILED', 'Failed to fetch municipalities.'),
        };
      }

      const filteredMunicipalities = municipalitiesResult.data.filter((municipality) => districtIds.includes(municipality.district_id));

      const municipalitiesByDistrict = new Map<string, LocationHierarchyMunicipality[]>();
      for (const municipality of filteredMunicipalities) {
        const existing = municipalitiesByDistrict.get(municipality.district_id) ?? [];
        existing.push({
          id: municipality.id,
          code: municipality.code,
          name: municipality.name,
        });
        municipalitiesByDistrict.set(municipality.district_id, existing);
      }

      for (const item of municipalitiesByDistrict.values()) {
        item.sort((a, b) => a.name.localeCompare(b.name));
      }

      const districtsByProvince = new Map<string, LocationHierarchyDistrict[]>();
      for (const district of filteredDistricts) {
        const existing = districtsByProvince.get(district.province_id) ?? [];
        existing.push({
          id: district.id,
          code: district.code,
          name: district.name,
          municipalities: municipalitiesByDistrict.get(district.id) ?? [],
        });
        districtsByProvince.set(district.province_id, existing);
      }

      for (const item of districtsByProvince.values()) {
        item.sort((a, b) => a.name.localeCompare(b.name));
      }

      const hierarchy: LocationHierarchyProvince[] = provinces.map((province) => ({
        id: province.id,
        code: province.code,
        name: province.name,
        region: province.region,
        districts: districtsByProvince.get(province.id) ?? [],
      }));

      hierarchy.sort((a, b) => a.name.localeCompare(b.name));

      const result = { data: hierarchy, error: null };
      this.writeCache(cacheKey, result);
      return result;
    } catch (error) {
      return {
        data: null,
        error: toServiceError('LOCATION_HIERARCHY_ERROR', 'Unexpected error while fetching location hierarchy.', error),
      };
    }
  }
}

export const geographicService = new GeographicService();
