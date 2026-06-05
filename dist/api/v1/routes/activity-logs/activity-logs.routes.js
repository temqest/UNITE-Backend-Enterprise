"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activityLogsRouter = void 0;
const express_1 = require("express");
const async_handler_1 = require("../../../../lib/async-handler");
const auth_middleware_1 = require("../../../../middelware/auth.middleware");
const authorization_middleware_1 = require("../../../../middelware/authorization.middleware");
const activity_logs_controller_1 = require("../../controllers/activity-logs/activity-logs.controller");
const router = (0, express_1.Router)();
exports.activityLogsRouter = router;
// Apply auth and permission checks
router.use(auth_middleware_1.authMiddleware);
router.use(authorization_middleware_1.requireActiveUser);
router.use(authorization_middleware_1.requireOrgScope);
router.use((0, authorization_middleware_1.requireRole)('admin', 'super_admin'));
router.get('/', (0, async_handler_1.asyncHandler)(activity_logs_controller_1.getActivityLogs));
exports.default = router;
