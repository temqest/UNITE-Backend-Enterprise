"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeGeoAreaKey = normalizeGeoAreaKey;
/**
 * Normalizes geographic area names into a consistent key for matching.
 * Format: region|province|municipality|barangay
 * Example output: "bicol-region|camarines-sur|city-of-iriga|"
 */
function normalizeGeoAreaKey(params) {
    const normalize = (str) => {
        if (!str)
            return '';
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
