"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveStaffController = approveStaffController;
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const user_service_1 = require("../../../../services/users/user.service");
const notification_service_1 = require("../../../../services/notifications/notification.service");
const users_1 = require("../../validators/users");
const userService = new user_service_1.UserService(supabase_client_1.supabaseServer, notification_service_1.notificationService);
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
function canApproveStaff(user) {
    const roleType = user.role?.type ?? '';
    const permissions = user.role?.permissions ?? [];
    return roleType === 'super_admin' || permissions.includes('*') || permissions.includes('approve_staff');
}
async function approveStaffController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user required.',
            });
            return;
        }
        if (!canApproveStaff(req.user)) {
            sendError(res, 403, {
                code: 'FORBIDDEN',
                message: 'You do not have permission to approve staff.',
            });
            return;
        }
        const validation = (0, users_1.validateStaffApproval)(req.body ?? {});
        if (!validation.success) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid staff approval payload.',
                details: validation.error,
            });
            return;
        }
        const approvalData = validation.data;
        if (!approvalData) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid staff approval payload.',
            });
            return;
        }
        if (approvalData.status === 'approve') {
            const result = await userService.approvePendingUser({
                requester_auth_id: req.user.auth_id ?? req.user.id,
                user_id: approvalData.userId,
                role_type: typeof approvalData.roleType === 'string' ? approvalData.roleType : undefined,
                sector: typeof approvalData.sector === 'string' ? approvalData.sector : undefined,
            });
            if (result.error || !result.data) {
                sendError(res, 400, {
                    code: result.error?.code ?? 'STAFF_APPROVAL_FAILED',
                    message: result.error?.message ?? 'Failed to approve staff user.',
                    details: result.error?.details,
                });
                return;
            }
            res.status(200).json({ success: true, data: result.data });
            return;
        }
        const { data: targetUserRaw, error: targetError } = await supabase_client_1.supabaseServer
            .from('users')
            .select('id, auth_id, is_active, org_id')
            .eq('id', approvalData.userId)
            .eq('org_id', req.user.org_id ?? '')
            .maybeSingle();
        const targetUser = targetUserRaw;
        if (targetError || !targetUser) {
            sendError(res, 400, {
                code: 'STAFF_REJECTION_FAILED',
                message: 'Failed to reject staff user.',
                details: targetError,
            });
            return;
        }
        if (targetUser.is_active) {
            sendError(res, 400, {
                code: 'INVALID_REJECTION_TARGET',
                message: 'Only pending signup accounts can be rejected from this flow.',
            });
            return;
        }
        const authId = typeof targetUser.auth_id === 'string' ? targetUser.auth_id : '';
        if (authId) {
            const authDelete = await supabase_client_1.supabaseServer.auth.admin.deleteUser(authId);
            if (authDelete.error) {
                sendError(res, 400, {
                    code: 'STAFF_REJECTION_FAILED',
                    message: 'Failed to reject staff user.',
                    details: authDelete.error,
                });
                return;
            }
        }
        else {
            await supabase_client_1.supabaseServer.from('users').delete().eq('id', approvalData.userId);
        }
        res.status(200).json({
            success: true,
            data: {
                userId: approvalData.userId,
                status: 'rejected',
            },
        });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'STAFF_APPROVAL_ERROR',
            message: 'Unexpected error while processing staff approval action.',
            details: error,
        });
    }
}
