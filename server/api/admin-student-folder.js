const { flattenDriveFolderItems, listDriveFolderTree } = require('./_google-drive');
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

function getDriveFolderId(value) {
    const raw = String(value || '').trim();
    if (DRIVE_ID_PATTERN.test(raw)) return raw;
    if (!raw || raw.length > 500) return '';

    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') return '';
        const pathMatch = url.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,200})(?:\/|$)/);
        const candidate = pathMatch?.[1] || url.searchParams.get('id') || '';
        return DRIVE_ID_PATTERN.test(candidate) ? candidate : '';
    } catch {
        return '';
    }
}

async function readExistingFolder(config, accessToken, studentId) {
    const response = await fetch(
        config.url + '/rest/v1/student_drive_folders?select=id'
            + '&student_id=eq.' + encodeURIComponent(studentId)
            + '&limit=1',
        {
            headers: {
                apikey: config.anonKey,
                Authorization: 'Bearer ' + accessToken,
            },
            signal: AbortSignal.timeout(10000),
        }
    );
    if (!response.ok) {
        const error = new Error('Unable to read the student folder mapping.');
        error.status = response.status;
        throw error;
    }
    const rows = await response.json();
    return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
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
        return sendJson(res, 400, { success: false, error: 'Folder request is too large.' });
    }
    const unknownFields = Object.keys(body).filter(function (key) {
        return !['studentId', 'title', 'driveFolder'].includes(key);
    });
    const studentId = String(body.studentId || '').trim();
    const title = String(body.title || '').trim().replace(/\s+/g, ' ');
    const driveFolderId = getDriveFolderId(body.driveFolder);
    if (
        unknownFields.length
        || !UUID_PATTERN.test(studentId)
        || title.length < 2
        || title.length > 120
        || /[<>\x00-\x1f\x7f]/.test(title)
        || !driveFolderId
    ) {
        return sendJson(res, 400, { success: false, error: 'Enter a valid title and restricted Google Drive folder link.' });
    }

    const config = getSupabaseConfig();
    const accessToken = getAdminAccessToken(req);
    if (!config || !accessToken) {
        return sendJson(res, 503, { success: false, error: 'Student administration is not configured.' });
    }

    try {
        const driveFolder = await listDriveFolderTree(driveFolderId);
        const existing = await readExistingFolder(config, accessToken, studentId);
        const resource = existing
            ? 'student_drive_folders?id=eq.' + encodeURIComponent(existing.id)
                + '&select=id,title,created_at,updated_at'
            : 'student_drive_folders?select=id,title,created_at,updated_at';
        const method = existing ? 'PATCH' : 'POST';
        const record = {
            title,
            google_drive_folder_id: driveFolder.folder.id,
            updated_at: new Date().toISOString(),
        };
        if (!existing) record.student_id = studentId;

        const response = await fetch(config.url + '/rest/v1/' + resource, {
            method,
            headers: {
                apikey: config.anonKey,
                Authorization: 'Bearer ' + accessToken,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
            },
            body: JSON.stringify(record),
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            const status = response.status === 409 ? 409 : response.status === 403 ? 403 : 502;
            return sendJson(res, status, {
                success: false,
                error: status === 409
                    ? 'That Drive folder is already connected to another student.'
                    : status === 403
                        ? 'This admin account cannot connect student folders.'
                        : 'Unable to connect this folder right now.',
            });
        }

        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length !== 1) {
            return sendJson(res, 502, { success: false, error: 'Unable to confirm the connected folder.' });
        }
        return sendJson(res, existing ? 200 : 201, {
            success: true,
            folder: {
                id: rows[0].id,
                title: rows[0].title,
                itemCount: driveFolder.itemCount,
                previewableCount: flattenDriveFolderItems(driveFolder.items).filter(function (item) {
                    return item.previewable;
                }).length,
                truncated: driveFolder.truncated,
                createdAt: rows[0].created_at,
                updatedAt: rows[0].updated_at,
            },
        });
    } catch (error) {
        if (error?.code === 'DRIVE_NOT_CONFIGURED') {
            return sendJson(res, 503, { success: false, error: 'Google Drive is not configured yet.' });
        }
        if (['INVALID_DRIVE_FOLDER', 'DRIVE_FOLDER_NOT_FOUND', 'NOT_A_DRIVE_FOLDER'].includes(error?.code)) {
            return sendJson(res, 400, {
                success: false,
                error: 'The folder could not be read. Keep it Restricted and share it with the displayed service account as Viewer.',
            });
        }
        if (error?.status === 403) {
            return sendJson(res, 403, { success: false, error: 'This admin account cannot connect student folders.' });
        }
        console.error('Admin student folder error:', error instanceof Error ? error.message : 'unknown error');
        return sendJson(res, 502, { success: false, error: 'Unable to verify this Drive folder right now.' });
    }
};
