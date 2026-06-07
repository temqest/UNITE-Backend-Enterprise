"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const approval_controller_1 = require("../../controllers/users/approval.controller");
const profile_controller_1 = require("../../controllers/users/profile.controller");
const settings_controller_1 = require("../../controllers/users/settings.controller");
const staff_management_controller_1 = require("../../controllers/users/staff-management.controller");
const staff_detail_controller_1 = require("../../controllers/users/staff-detail.controller");
const profile_picture_controller_1 = require("../../controllers/users/profile-picture.controller");
const signup_controller_1 = require("../../controllers/users/signup.controller");
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
const usersRouter = (0, express_1.Router)();
exports.usersRouter = usersRouter;
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    },
});
const profilePictureRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many profile picture uploads from this IP, please try again after 15 minutes.',
        },
    },
});
usersRouter.post('/signup', (0, validate_middleware_1.validateMiddleware)(toValidator(users_1.validateSignup)), async (req, res, next) => {
    try {
        const role = typeof req.body?.role === 'string' ? req.body.role.toLowerCase() : '';
        const hasOrganization = Boolean(req.body?.organization);
        if (role === 'admin' || hasOrganization) {
            await (0, signup_controller_1.signupAdminController)(req, res);
            return;
        }
        await (0, signup_controller_1.signupStaffController)(req, res);
    }
    catch (error) {
        next(error);
    }
});
usersRouter.get('/profile', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('users.read'), (0, validate_middleware_1.validateMiddleware)(toValidator(users_1.validateGetProfile)), (0, async_handler_1.asyncHandler)(profile_controller_1.getProfileController));
usersRouter.patch('/profile', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('users.read'), (0, validate_middleware_1.validateMiddleware)(toValidator(users_1.validateProfileUpdate)), (0, async_handler_1.asyncHandler)(profile_controller_1.updateProfileController));
usersRouter.post('/approve-staff', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('users.approve'), (0, validate_middleware_1.validateMiddleware)(toValidator(users_1.validateStaffApproval)), (0, async_handler_1.asyncHandler)(approval_controller_1.approveStaffController));
usersRouter.patch('/settings', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('settings.update'), (0, validate_middleware_1.validateMiddleware)(toValidator(users_1.validateSettingsUpdate)), (0, async_handler_1.asyncHandler)(settings_controller_1.updateUserSettingsController));
usersRouter.get('/', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('users.invite'), (0, validate_middleware_1.validateMiddleware)(toValidator(users_1.validateStaffListQuery), 'query'), (0, async_handler_1.asyncHandler)(staff_management_controller_1.listStaffController));
usersRouter.post('/', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('users.invite'), (0, validate_middleware_1.validateMiddleware)(toValidator(users_1.validateStaffCreate)), (0, async_handler_1.asyncHandler)(staff_management_controller_1.createStaffManagementController));
usersRouter.get('/:id/detail', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('users.read'), (0, validate_middleware_1.validateMiddleware)(toValidator(users_1.validateUserIdParam), 'params'), (0, async_handler_1.asyncHandler)(staff_detail_controller_1.getStaffDetailController));
usersRouter.patch('/:id', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('users.invite'), (0, validate_middleware_1.validateMiddleware)(toValidator(users_1.validateUserIdParam), 'params'), (0, validate_middleware_1.validateMiddleware)(toValidator(users_1.validateStaffUpdate)), (0, async_handler_1.asyncHandler)(staff_management_controller_1.updateStaffManagementController));
usersRouter.delete('/:id', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('users.invite'), (0, validate_middleware_1.validateMiddleware)(toValidator(users_1.validateUserIdParam), 'params'), (0, async_handler_1.asyncHandler)(staff_management_controller_1.deleteStaffManagementController));
usersRouter.post('/:id/profile-picture', profilePictureRateLimiter, auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, validate_middleware_1.validateMiddleware)(toValidator(users_1.validateUserIdParam), 'params'), upload.single('profile_picture'), (0, async_handler_1.asyncHandler)(profile_picture_controller_1.uploadProfilePictureController));
usersRouter.delete('/:id/profile-picture', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, validate_middleware_1.validateMiddleware)(toValidator(users_1.validateUserIdParam), 'params'), (0, async_handler_1.asyncHandler)(profile_picture_controller_1.deleteProfilePictureController));
exports.default = usersRouter;
