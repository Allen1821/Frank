const {
    getAdminAccessToken,
    getSupabaseConfig,
    isJsonRequest,
    requireAdmin,
    requireCsrf,
    requireSameOrigin,
    sendJson,
    setAdminSecurityHeaders,
} = require('./_admin-utils');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RENEWAL_STATUSES = new Set(['active', 'due_soon', 'expired', 'pending']);

function parseDateInput(value) {
    if (value === null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const date = new Date(value + 'T00:00:00.000Z');
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
        ? undefined
        : value;
}

module.exports = async function handler(req, res) {
    setAdminSecurityHeaders(res);
    if (req.method !== 'PATCH') {
        res.setHeader('Allow', 'PATCH');
        return sendJson(res, 405, { success: false, error: 'Method not allowed.' });
    }
    if (!requireSameOrigin(req, res) || !requireCsrf(req, res)) return;
    if (!isJsonRequest(req)) {
        return sendJson(res, 400, { success: false, error: 'Content-Type must be application/json.' });
    }
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const body = req.body || {};
    const unknownFields = Object.keys(body).filter(function (key) {
        return !['studentId', 'portalActive', 'renewalStatus', 'renewalDate', 'renewalDueDate'].includes(key);
    });
    const studentId = String(body.studentId || '').trim();
    const hasPortalUpdate = Object.prototype.hasOwnProperty.call(body, 'portalActive');
    const renewalKeys = ['renewalStatus', 'renewalDate', 'renewalDueDate'];
    const hasRenewalUpdate = renewalKeys.some(function (key) {
        return Object.prototype.hasOwnProperty.call(body, key);
    });
    if (
        unknownFields.length
        || !UUID_PATTERN.test(studentId)
        || (!hasPortalUpdate && !hasRenewalUpdate)
        || (hasPortalUpdate && typeof body.portalActive !== 'boolean')
        || (hasRenewalUpdate && !renewalKeys.every(function (key) {
            return Object.prototype.hasOwnProperty.call(body, key);
        }))
    ) {
        return sendJson(res, 400, { success: false, error: 'Invalid student update.' });
    }

    const updatePayload = { updated_at: new Date().toISOString() };
    if (hasPortalUpdate) {
        updatePayload.portal_active = body.portalActive;
        updatePayload.portal_deactivated_at = body.portalActive ? null : new Date().toISOString();
    }
    if (hasRenewalUpdate) {
        const renewalStatus = String(body.renewalStatus || '').trim().toLowerCase();
        const renewalDate = parseDateInput(body.renewalDate);
        const renewalDueDate = parseDateInput(body.renewalDueDate);
        if (
            !RENEWAL_STATUSES.has(renewalStatus)
            || renewalDate === undefined
            || renewalDueDate === undefined
            || (renewalDate && renewalDueDate && renewalDueDate < renewalDate)
        ) {
            return sendJson(res, 400, { success: false, error: 'Invalid renewal or expiration information.' });
        }
        updatePayload.renewal_status = renewalStatus;
        updatePayload.renewal_date = renewalDate;
        updatePayload.renewal_due_date = renewalDueDate;
    }

    const config = getSupabaseConfig();
    const accessToken = getAdminAccessToken(req);
    if (!config || !accessToken) {
        return sendJson(res, 503, { success: false, error: 'Student administration is not configured.' });
    }

    try {
        const response = await fetch(
            config.url + '/rest/v1/students?id=eq.' + encodeURIComponent(studentId)
                + '&select=id,portal_active,portal_deactivated_at,renewal_status,renewal_date,renewal_due_date',
            {
                method: 'PATCH',
                headers: {
                    apikey: config.anonKey,
                    Authorization: 'Bearer ' + accessToken,
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation',
                },
                body: JSON.stringify(updatePayload),
                signal: AbortSignal.timeout(10000),
            }
        );
        if (!response.ok) {
            return sendJson(res, response.status === 403 ? 403 : 502, {
                success: false,
                error: response.status === 403
                    ? 'This admin account cannot update the student record.'
                    : response.status === 400
                        ? 'The renewal or access update was rejected.'
                        : 'Unable to update the student right now.',
            });
        }
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length !== 1) {
            return sendJson(res, 404, { success: false, error: 'Student not found.' });
        }
        return sendJson(res, 200, {
            success: true,
            student: {
                id: rows[0].id,
                portalActive: rows[0].portal_active,
                portalDeactivatedAt: rows[0].portal_deactivated_at,
                renewalStatus: rows[0].renewal_status,
                renewalDate: rows[0].renewal_date,
                renewalDueDate: rows[0].renewal_due_date,
            },
        });
    } catch (error) {
        console.error('Admin student update error:', error instanceof Error ? error.message : 'unknown error');
        return sendJson(res, 502, { success: false, error: 'Unable to update the student right now.' });
    }
};
