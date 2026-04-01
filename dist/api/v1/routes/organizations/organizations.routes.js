"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationsRouter = void 0;
const express_1 = require("express");
const async_handler_1 = require("../../../../lib/async-handler");
const validate_middleware_1 = require("../../../../middelware/validate.middleware");
const lookup_controller_1 = require("../../controllers/organizations/lookup.controller");
const lookup_validator_1 = require("../../validators/organizations/lookup.validator");
function toValidator(validateFn) {
    return {
        validate: (payload) => {
            const result = validateFn(payload);
            if (result && typeof result === 'object' && typeof result.success === 'boolean') {
                return result.success
                    ? { success: true, data: result.data }
                    : { success: false, error: result.error };
            }
            if (result && typeof result === 'object' && 'error' in result) {
                return result.error
                    ? { success: false, error: result.error }
                    : { success: true, data: result.data };
            }
            return { success: true, data: result };
        },
    };
}
const organizationsRouter = (0, express_1.Router)();
exports.organizationsRouter = organizationsRouter;
organizationsRouter.get('/lookup', (0, validate_middleware_1.validateMiddleware)(toValidator(lookup_validator_1.validateLookupOrganizationCode), 'query'), (0, async_handler_1.asyncHandler)(lookup_controller_1.lookupOrganizationByCodeController));
exports.default = organizationsRouter;
