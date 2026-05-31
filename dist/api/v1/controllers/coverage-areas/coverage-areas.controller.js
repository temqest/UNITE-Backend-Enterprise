"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileEvents = exports.deleteCoverageArea = exports.updateCoverageArea = exports.createCoverageArea = exports.getCoverageArea = exports.listCoverageAreas = void 0;
const coverage_areas_service_1 = require("../../../../services/coverage-areas/coverage-areas.service");
const listCoverageAreas = async (req, res) => {
    const orgId = req.user.org_id;
    const { status, area_type, search } = req.query;
    const data = await coverage_areas_service_1.coverageAreasService.listCoverageAreas(orgId, {
        status: status,
        area_type: area_type,
        search: search,
    });
    res.json({ success: true, data });
};
exports.listCoverageAreas = listCoverageAreas;
const getCoverageArea = async (req, res) => {
    const orgId = req.user.org_id;
    const id = req.params.id;
    const data = await coverage_areas_service_1.coverageAreasService.getCoverageArea(id, orgId);
    res.json({ success: true, data });
};
exports.getCoverageArea = getCoverageArea;
const createCoverageArea = async (req, res) => {
    const orgId = req.user.org_id;
    const userId = req.user.id;
    const data = await coverage_areas_service_1.coverageAreasService.createCoverageArea(orgId, userId, req.body);
    res.status(201).json({ success: true, data });
};
exports.createCoverageArea = createCoverageArea;
const updateCoverageArea = async (req, res) => {
    const orgId = req.user.org_id;
    const userId = req.user.id;
    const id = req.params.id;
    const data = await coverage_areas_service_1.coverageAreasService.updateCoverageArea(id, orgId, userId, req.body);
    res.json({ success: true, data });
};
exports.updateCoverageArea = updateCoverageArea;
const deleteCoverageArea = async (req, res) => {
    const orgId = req.user.org_id;
    const id = req.params.id;
    await coverage_areas_service_1.coverageAreasService.deleteCoverageArea(id, orgId);
    res.json({ success: true });
};
exports.deleteCoverageArea = deleteCoverageArea;
const reconcileEvents = async (req, res) => {
    const orgId = req.user.org_id;
    const id = req.params.id;
    const coverageArea = await coverage_areas_service_1.coverageAreasService.getCoverageArea(id, orgId);
    const matchedCount = await coverage_areas_service_1.coverageAreasService.reconcileEventsForCoverageArea(orgId, coverageArea);
    const data = await coverage_areas_service_1.coverageAreasService.getCoverageArea(id, orgId); // refetch with new aggregations
    res.json({ success: true, matchedCount, data });
};
exports.reconcileEvents = reconcileEvents;
