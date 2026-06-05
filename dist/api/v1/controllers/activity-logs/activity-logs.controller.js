"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActivityLogs = void 0;
const activity_log_service_1 = require("../../../../services/activity-logs/activity-log.service");
const getActivityLogs = async (req, res) => {
    const { org_id } = req.user;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const filters = {
        orgId: org_id,
        action: req.query.action,
        entityType: req.query.entity_type,
        actorUserId: req.query.actor_user_id,
        dateFrom: req.query.date_from,
        dateTo: req.query.date_to,
        page,
        limit,
    };
    const result = await activity_log_service_1.ActivityLogService.queryLogs(filters);
    res.status(200).json({
        success: true,
        data: result,
    });
};
exports.getActivityLogs = getActivityLogs;
