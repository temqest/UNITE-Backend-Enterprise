"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStaffDetailController = getStaffDetailController;
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const profile_picture_service_1 = require("../../../../services/users/profile-picture.service");
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
async function getStaffDetailController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user with organization scope required.',
            });
            return;
        }
        const targetUserId = req.params?.id;
        if (!targetUserId) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'User id is required.',
            });
            return;
        }
        // 1. Fetch user
        const { data: userRaw, error: userError } = await supabase_client_1.supabaseServer
            .from('users')
            .select('*')
            .eq('id', targetUserId)
            .eq('org_id', req.user.org_id)
            .maybeSingle();
        if (userError || !userRaw) {
            sendError(res, 404, {
                code: 'USER_NOT_FOUND',
                message: 'Staff user not found.',
                details: userError,
            });
            return;
        }
        const targetRoleObj = typeof userRaw.role === 'string' ? userRaw.role : userRaw.role?.type;
        const targetRole = String(targetRoleObj || '');
        if (targetRole === 'super_admin' && req.user.id !== targetUserId && req.user.role?.type !== 'super_admin') {
            sendError(res, 403, {
                code: 'PROTECTED_SUPER_ADMIN',
                message: 'You do not have permission to view this profile.',
            });
            return;
        }
        // 2. Fetch assigned events via event_staff
        const { data: eventStaff, error: staffError } = await supabase_client_1.supabaseServer
            .from('event_staff')
            .select(`
        assignment_role,
        event_id
      `)
            .eq('user_id', targetUserId)
            .eq('org_id', req.user.org_id);
        if (staffError) {
            sendError(res, 500, {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch staff event assignments.',
                details: staffError,
            });
            return;
        }
        const assignedEventIds = (eventStaff || []).map((es) => es.event_id);
        // 3. Fetch events created by, or assigned to this staff member
        let events = [];
        if (assignedEventIds.length > 0) {
            const { data: assignedEvents, error: eventsError } = await supabase_client_1.supabaseServer
                .from('events')
                .select('*')
                .eq('org_id', req.user.org_id)
                .in('id', assignedEventIds)
                .order('event_date', { ascending: false });
            if (eventsError) {
                sendError(res, 500, {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to fetch staff events.',
                    details: eventsError,
                });
                return;
            }
            events = assignedEvents || [];
        }
        const { data: createdEventsData, error: createdError } = await supabase_client_1.supabaseServer
            .from('events')
            .select('*')
            .eq('org_id', req.user.org_id)
            .eq('created_by', targetUserId);
        if (createdError) {
            sendError(res, 500, {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch staff created events.',
                details: createdError,
            });
            return;
        }
        const createdEvents = createdEventsData || [];
        // Combine events and dedup
        const allEventsMap = new Map();
        [...events, ...createdEvents].forEach(evt => allEventsMap.set(evt.id, evt));
        const allEvents = Array.from(allEventsMap.values());
        // Sort all events by date desc
        allEvents.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());
        // Compute stats
        let completedEvents = 0;
        let pendingEvents = 0;
        let cancelledEvents = 0;
        let publishedEvents = 0;
        let eventsNeedingDetails = 0;
        let totalCollectedUnits = 0;
        let postEventUpdatesSubmitted = 0;
        // Compute stats only for assigned events per requirements for performance, or all events if they are the creator
        const statsEventsMap = new Map();
        [...events, ...createdEvents].forEach(evt => statsEventsMap.set(evt.id, evt));
        statsEventsMap.forEach((evt) => {
            if (evt.status === 'completed')
                completedEvents++;
            if (['needs_details', 'scheduled', 'ongoing', 'plotted'].includes(evt.status))
                pendingEvents++;
            if (evt.status === 'cancelled')
                cancelledEvents++;
            if (evt.status === 'published')
                publishedEvents++;
            if (evt.setup_status === 'needs_details')
                eventsNeedingDetails++;
            if (evt.status === 'completed' && evt.type === 'blood_drive') {
                const extraData = evt.extra_data || {};
                const collected = Number(extraData.collected_blood) || Number(evt.actual_collected_bags) || 0;
                totalCollectedUnits += collected;
            }
            // Proxy for post-event updates
            if (evt.status === 'completed' && evt.updated_by === targetUserId) {
                postEventUpdatesSubmitted++;
            }
        });
        const averageCollectedUnits = completedEvents > 0 ? (totalCollectedUnits / completedEvents) : 0;
        const totalCount = completedEvents + pendingEvents + cancelledEvents;
        const completionRate = totalCount > 0 ? (completedEvents / totalCount) * 100 : 0;
        const stats = {
            assigned_events: eventStaff?.length || 0,
            created_events: createdEvents.length || 0,
            completed_events: completedEvents,
            pending_events: pendingEvents,
            cancelled_events: cancelledEvents,
            published_events: publishedEvents,
            events_needing_details: eventsNeedingDetails,
            post_event_updates_submitted: postEventUpdatesSubmitted,
            total_collected_units: totalCollectedUnits,
            average_collected_units_per_completed_event: Math.round(averageCollectedUnits * 10) / 10,
            completion_rate: Math.round(completionRate * 10) / 10,
        };
        // Map assignments to events
        const eventStaffMap = new Map();
        eventStaff?.forEach((es) => eventStaffMap.set(es.event_id, es.assignment_role));
        const enrichedEvents = allEvents.map(evt => ({
            ...evt,
            assignment_role: eventStaffMap.get(evt.id) || null
        }));
        // Format geographic area 
        const geographicArea = userRaw.geographic_area;
        const sector = geographicArea?.sector ?? null;
        const province = geographicArea?.province ?? null;
        const district = geographicArea?.district ?? null;
        const municipality = geographicArea?.municipality ?? null;
        const roleObj = typeof userRaw.role === 'string'
            ? { type: userRaw.role, permissions: [] }
            : userRaw.role;
        const staffData = {
            id: userRaw.id,
            auth_id: userRaw.auth_id,
            org_id: userRaw.org_id,
            first_name: userRaw.first_name,
            last_name: userRaw.last_name,
            full_name: `${userRaw.first_name || ''} ${userRaw.last_name || ''}`.trim(),
            email: userRaw.email,
            phone_number: userRaw.phone_number,
            role: roleObj?.type || '',
            permissions: roleObj?.permissions || [],
            status: userRaw.is_active ? 'active' : 'pending',
            geographic_area: userRaw.geographic_area,
            sector,
            province,
            district,
            municipality,
            created_at: userRaw.created_at,
            profile_picture_path: userRaw.profile_picture_path,
        };
        const finalStaffData = await (0, profile_picture_service_1.attachSignedProfileUrls)(staffData);
        res.status(200).json({
            success: true,
            data: {
                staff: finalStaffData,
                stats,
                events: enrichedEvents,
                recent_activity: enrichedEvents.slice(0, 5) // Send top 5 events as proxy for recent activity
            }
        });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'GET_STAFF_DETAIL_ERROR',
            message: 'Unexpected error while fetching staff detail.',
            details: error,
        });
    }
}
