const {
    clearStudentCookies,
    getSupabaseConfig,
    requireStudent,
    sendJson,
    setStudentSecurityHeaders,
} = require('./_student-utils');

module.exports = async function handler(req, res) {
    setStudentSecurityHeaders(res);
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return sendJson(res, 405, { success: false, error: 'Method not allowed.' });
    }

    const session = await requireStudent(req, res);
    if (!session) return;

    const config = getSupabaseConfig();
    if (!config) {
        return sendJson(res, 503, { success: false, error: 'Student portal data is not configured.' });
    }
    try {
        const response = await fetch(
            config.url + '/rest/v1/students?select=id&auth_user_id=eq.'
                + encodeURIComponent(String(session.user.id || ''))
                + '&portal_active=eq.true&limit=1',
            {
                headers: {
                    apikey: config.publishableKey,
                    Authorization: 'Bearer ' + session.accessToken,
                },
                signal: AbortSignal.timeout(10000),
            }
        );
        if (!response.ok) {
            return sendJson(res, 502, { success: false, error: 'Unable to verify portal access.' });
        }
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length !== 1) {
            clearStudentCookies(res, req);
            return sendJson(res, 403, { success: false, error: 'Student portal access is inactive.' });
        }
    } catch {
        return sendJson(res, 502, { success: false, error: 'Unable to verify portal access.' });
    }

    return sendJson(res, 200, {
        success: true,
        csrfToken: session.csrfToken,
        user: { email: String(session.user.email || '').toLowerCase() },
    });
};
