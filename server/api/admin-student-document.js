const { inspectDriveImage } = require('./_google-drive');
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
const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

function getDriveFileId(value) {
    const raw = String(value || '').trim();
    if (DRIVE_ID_PATTERN.test(raw)) return raw;
    if (!raw || raw.length > 500) return '';

    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') return '';
        const pathMatch = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,200})(?:\/|$)/);
        const candidate = pathMatch?.[1] || url.searchParams.get('id') || '';
        return DRIVE_ID_PATTERN.test(candidate) ? candidate : '';
    } catch {
        return '';
    }
}

module.exports = async function handler(req, res) {
    setAdminSecurityHeaders(res);
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return sendJson(res, 405, { success: false, error: 'Method not allowed.' });
    }
    if (!requireSameOrigin(req, res) || !requireCsrf(req, res)) return;
    if (!isJsonRequest(req)) {
        return sendJson(res, 400, { success: false, error: 'Content-Type must be application/json.' });
    }
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const body = req.body || {};
    if (JSON.stringify(body).length > 8192) {
        return sendJson(res, 400, { success: false, error: 'Document request is too large.' });
    }
    const unknownFields = Object.keys(body).filter(function (key) {
        return !['studentId', 'title', 'driveFile'].includes(key);
    });
    const studentId = String(body.studentId || '').trim();
    const title = String(body.title || '').trim().replace(/\s+/g, ' ');
    const driveFileId = getDriveFileId(body.driveFile);
    if (
        unknownFields.length
        || !UUID_PATTERN.test(studentId)
        || title.length < 2
        || title.length > 120
        || /[<>\x00-\x1f\x7f]/.test(title)
        || !driveFileId
    ) {
        return sendJson(res, 400, { success: false, error: 'Enter a valid title and private Google Drive image link.' });
    }

    const config = getSupabaseConfig();
    const accessToken = getAdminAccessToken(req);
    if (!config || !accessToken) {
        return sendJson(res, 503, { success: false, error: 'Student administration is not configured.' });
    }

    try {
        const driveFile = await inspectDriveImage(driveFileId);
        const response = await fetch(config.url + '/rest/v1/student_documents?select=id,title,mime_type,created_at', {
            method: 'POST',
            headers: {
                apikey: config.anonKey,
                Authorization: 'Bearer ' + accessToken,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
            },
            body: JSON.stringify({
                student_id: studentId,
                title,
                google_drive_file_id: driveFileId,
                mime_type: driveFile.mimeType,
                display_order: 10,
            }),
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            const status = response.status === 409 ? 409 : response.status === 403 ? 403 : 502;
            return sendJson(res, status, {
                success: false,
                error: status === 409
                    ? 'That Drive file is already connected to a student.'
                    : status === 403
                        ? 'This admin account cannot connect student documents.'
                        : 'Unable to connect this document right now.',
            });
        }
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length !== 1) {
            return sendJson(res, 502, { success: false, error: 'Unable to confirm the connected document.' });
        }
        return sendJson(res, 201, {
            success: true,
            document: {
                id: rows[0].id,
                title: rows[0].title,
                mimeType: rows[0].mime_type,
                createdAt: rows[0].created_at,
            },
        });
    } catch (error) {
        if (error?.code === 'DRIVE_NOT_CONFIGURED') {
            return sendJson(res, 503, { success: false, error: 'Google Drive is not configured yet.' });
        }
        if (['DRIVE_FILE_NOT_FOUND', 'UNSUPPORTED_DRIVE_FILE', 'DRIVE_FILE_TOO_LARGE'].includes(error?.code)) {
            return sendJson(res, 400, {
                success: false,
                error: 'The image could not be read. Share its folder with the service account as Viewer and use a JPG, PNG, or WebP file under 12 MB.',
            });
        }
        console.error('Admin student document error:', error instanceof Error ? error.message : 'unknown error');
        return sendJson(res, 502, { success: false, error: 'Unable to verify this Drive image right now.' });
    }
};
