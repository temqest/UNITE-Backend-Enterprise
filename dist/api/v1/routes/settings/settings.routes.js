"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsRouter = void 0;
const express_1 = require("express");
const settings_controller_1 = require("../../controllers/users/settings.controller");
const users_1 = require("../../validators/users");
const auth_middleware_1 = require("../../../../middelware/auth.middleware");
const authorization_middleware_1 = require("../../../../middelware/authorization.middleware");
const validate_middleware_1 = require("../../../../middelware/validate.middleware");
const async_handler_1 = require("../../../../lib/async-handler");
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
const passthroughValidator = {
    validate: (payload) => ({ success: true, data: payload }),
};
const settingsRouter = (0, express_1.Router)();
exports.settingsRouter = settingsRouter;
settingsRouter.get('/organization', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('settings.read'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(settings_controller_1.getOrganizationSettingsController));
settingsRouter.patch('/organization', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('settings.update'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(settings_controller_1.updateOrganizationSettingsController));
settingsRouter.get('/user', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(settings_controller_1.getUserSettingsController));
settingsRouter.patch('/user', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(toValidator(users_1.validateSettingsUpdate)), (0, async_handler_1.asyncHandler)(settings_controller_1.updateUserSettingsController));
exports.default = settingsRouter;
