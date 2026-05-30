export interface GeoAreaParams {
  region?: string | null;
  province?: string | null;
  municipality_or_city?: string | null;
  barangay?: string | null;
}

/**
 * Normalizes geographic area names into a consistent key for matching.
 * Format: region|province|municipality|barangay
 * Example output: "bicol-region|camarines-sur|city-of-iriga|"
 */
export function normalizeGeoAreaKey(params: GeoAreaParams): string {
  const normalize = (str?: string | null) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const region = normalize(params.region);
  const province = normalize(params.province);
  const muni = normalize(params.municipality_or_city);
  const barangay = normalize(params.barangay);

  return `${region}|${province}|${muni}|${barangay}`;
}
