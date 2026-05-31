"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRoutes = void 0;
const express_1 = require("express");
const analytics_controller_1 = require("../../controllers/analytics/analytics.controller");
const auth_middleware_1 = require("../../../../middelware/auth.middleware");
const authorization_middleware_1 = require("../../../../middelware/authorization.middleware");
const async_handler_1 = require("../../../../lib/async-handler");
const router = (0, express_1.Router)();
const analyticsController = new analytics_controller_1.AnalyticsController();
// Use events.read for now as temporary fallback if analytics.read is not configured
router.get('/dashboard', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.read'), (0, async_handler_1.asyncHandler)(analyticsController.getDashboard.bind(analyticsController)));
exports.analyticsRoutes = router;
