const ROUTES = Object.freeze({
    'contact': require('../server/api/contact'),
    'renewal-upload': require('../server/api/renewal-upload'),
    'course-registration': require('../server/api/course-registration'),
    'admin-auth': require('../server/api/admin-auth'),
    'admin-session': require('../server/api/admin-session'),
    'admin-content': require('../server/api/admin-content'),
    'admin-students': require('../server/api/admin-students'),
    'admin-student': require('../server/api/admin-student'),
    'admin-student-document': require('../server/api/admin-student-document'),
    'admin-student-folder': require('../server/api/admin-student-folder'),
    'admin-student-notification': require('../server/api/admin-student-notification'),
    'student-auth': require('../server/api/student-auth'),
    'student-password-reset': require('../server/api/student-password-reset'),
    'student-password-recovery': require('../server/api/student-password-recovery'),
    'student-password-update': require('../server/api/student-password-update'),
    'student-register': require('../server/api/student-register'),
    'student-session': require('../server/api/student-session'),
    'student-account': require('../server/api/student-account'),
    'student-document': require('../server/api/student-document'),
});

function routeName(req) {
    const value = req.query?.route;
    const route = Array.isArray(value) ? value.join('/') : String(value || '');
    return route.replace(/^\/+|\/+$/g, '');
}

module.exports = async function handler(req, res) {
    const route = routeName(req);
    if (!Object.prototype.hasOwnProperty.call(ROUTES, route)) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.status(404).json({ success: false, error: 'API route not found.' });
    }

    return ROUTES[route](req, res);
};
