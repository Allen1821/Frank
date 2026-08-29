const {
    generateCsrfToken,
    getCsrfCookie,
    requireAdmin,
    sendJson,
    setAdminCookies,
    setAdminSecurityHeaders,
} = require('./_admin-utils');

module.exports = async function handler(req, res) {
    setAdminSecurityHeaders(res);

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return sendJson(res, 405, { success: false, error: 'Method not allowed.' });
    }

    const user = await requireAdmin(req, res);
    if (!user) return;

    let csrfToken = getCsrfCookie(req);
    if (!csrfToken) {
        csrfToken = generateCsrfToken();
        const accessToken = String((req.headers.cookie || '').match(/(?:^|;\s*)ds_admin_session=([^;]+)/)?.[1] || '');
        if (accessToken) {
            setAdminCookies(res, req, decodeURIComponent(accessToken), csrfToken, 3600);
        }
    }

    return sendJson(res, 200, {
        success: true,
        csrfToken,
        user: { email: user.email },
    });
};
