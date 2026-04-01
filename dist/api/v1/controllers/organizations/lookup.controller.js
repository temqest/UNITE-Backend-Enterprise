"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupOrganizationByCodeController = lookupOrganizationByCodeController;
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const organization_service_1 = require("../../../../services/organization/organization.service");
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
async function lookupOrganizationByCodeController(req, res) {
    try {
        const codeRaw = req.query?.code;
        if (typeof codeRaw !== 'string' || !codeRaw.trim()) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'code is required for organization lookup.',
            });
            return;
        }
        const orgService = new organization_service_1.OrganizationService(supabase_client_1.supabaseServer);
        const result = await orgService.validateOrganizationCode(codeRaw);
        if (result.error) {
            sendError(res, 400, {
                code: result.error.code,
                message: result.error.message,
                details: result.error.details,
            });
            return;
        }
        // For onboarding preview, we return `data: null` when not found/inactive
        // but still succeed the HTTP request.
        const organization = result.data?.organization ?? null;
        res.status(200).json({
            success: true,
            data: organization
                ? {
                    id: organization.id,
                    name: organization.name,
                    code: organization.code,
                    is_active: organization.is_active,
                }
                : null,
        });
    }
    catch (error) {
        const err = error;
        sendError(res, 500, {
            code: err.code ?? 'ORG_LOOKUP_ERROR',
            message: err.message ?? 'Unexpected error during organization lookup.',
            details: err.details,
        });
    }
}
