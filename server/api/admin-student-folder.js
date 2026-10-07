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
    if (!Array.isArray(rows) || rows.length > 1 || (rows.length && !UUID_PATTERN.test(rows[0]?.id))) {
        throw new Error('Invalid folder mapping response.');
    }
    return rows[0] || null;
}

// Called only after requireAdmin and a rejected connect. Use the caller's
// authenticated session so existing row-level visibility is preserved.
async function describeConnectedStudent(config, accessToken, driveFolderId, studentId) {
    const read = async resource => {
        const response = await fetch(config.url + '/rest/v1/' + resource, {
            headers: { apikey: config.anonKey, Authorization: 'Bearer ' + accessToken },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('Duplicate folder lookup unavailable.');
        return response.json();
    };
    try {
        const mappings = await read('student_drive_folders?select=student_id'
            + '&google_drive_folder_id=eq.' + encodeURIComponent(driveFolderId)
            + '&student_id=neq.' + encodeURIComponent(studentId) + '&limit=2');
        if (!Array.isArray(mappings) || mappings.length !== 1 || !UUID_PATTERN.test(mappings[0]?.student_id)) return '';
        const ownerId = mappings[0].student_id;
        const students = await read('students?select=id,full_name,student_number'
            + '&id=eq.' + encodeURIComponent(ownerId) + '&limit=1');
        if (!Array.isArray(students) || students.length !== 1 || students[0]?.id !== ownerId) return '';
        const owner = students[0];
        const clean = (value, max) => typeof value === 'string'
            ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
        const name = clean(owner.full_name, 200) || 'Student';
        const number = clean(owner.student_number, 40);
        // student_number is unique; retain an exact account ID fallback for
        // legacy records rather than ambiguously displaying a name alone.
        return name + (number ? ' (student #' + number + ')' : ' (account ' + ownerId + ')');
    } catch {
        // A lookup failure must never imply that the conflicting write succeeded
        // or leak upstream response bodies or credentials.
        return '';
    }
}

async function unlinkFolder(req, res, body) {
    const { studentId, folderId, updatedAt } = body;
    // Keep the original timestamp precision: Postgres timestamps can include
    // microseconds, which would be lost if converted through Date.toISOString().
    if (
        Object.keys(body).some(key => !['studentId', 'folderId', 'updatedAt'].includes(key))
        || typeof studentId !== 'string' || !UUID_PATTERN.test(studentId)
        || typeof folderId !== 'string' || !UUID_PATTERN.test(folderId)
        || typeof updatedAt !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(updatedAt)
        || !Number.isFinite(Date.parse(updatedAt))
    ) {
        return sendJson(res, 400, { success: false, error: 'Invalid folder unlink request. Refresh the student list and try again.' });
    }
    const config = getSupabaseConfig();
    const accessToken = getAdminAccessToken(req);
    if (!config || !accessToken) {
        return sendJson(res, 503, { success: false, error: 'Student administration is not configured.' });
    }
    try {
        // One conditional DELETE is the concurrency boundary. A replacement
        // updates updated_at, so a stale confirmation cannot remove that link.
        const response = await fetch(
            config.url + '/rest/v1/student_drive_folders?student_id=eq.' + encodeURIComponent(studentId)
                + '&id=eq.' + encodeURIComponent(folderId)
                + '&updated_at=eq.' + encodeURIComponent(updatedAt) + '&select=id',
            {
                method: 'DELETE',
                headers: {
                    apikey: config.anonKey,
                    Authorization: 'Bearer ' + accessToken,
                    Prefer: 'return=representation',
                },
                signal: AbortSignal.timeout(10000),
            }
        );
        if (!response.ok) {
            return sendJson(res, response.status === 403 ? 403 : 502, {
                success: false,
                error: response.status === 403
                    ? 'This admin account cannot unlink student folders. Check that the unlink migration has been applied.'
                    : 'Unable to unlink this folder right now.',
            });
        }
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length > 1 || (rows.length
            && String(rows[0]?.id || '').toLowerCase() !== folderId.toLowerCase())) {
            throw new Error('Invalid unlink response.');
        }
        if (!rows.length && await readExistingFolder(config, accessToken, studentId)) {
            return sendJson(res, 409, {
                success: false,
                error: 'The folder connection changed. Refresh the student list before unlinking.',
            });
        }
        return sendJson(res, 200, { success: true, folder: null });
    } catch (error) {
        console.error('Admin student folder unlink error:', error instanceof Error ? error.message : 'unknown error');
        return sendJson(res, error?.status === 403 ? 403 : 502, { success: false, error: 'Unable to confirm the folder was unlinked. Refresh the student list before trying again.' });
    }
}

module.exports = async function handler(req, res) {
    setAdminSecurityHeaders(res);
    if (!['POST', 'DELETE'].includes(req.method)) {
        res.setHeader('Allow', 'POST, DELETE');
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
    if (req.method === 'DELETE') return unlinkFolder(req, res, body);
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
            const connectedStudent = status === 409
                ? await describeConnectedStudent(config, accessToken, driveFolder.folder.id, studentId) : '';
            return sendJson(res, status, {
                success: false,
                error: status === 409
                    ? connectedStudent
                        ? 'That Drive folder is already connected to ' + connectedStudent + '. Use a different folder, or review that student’s connection first.'
                        : 'That Drive folder could not be connected. It may already belong to another student, but the connected account could not be identified. Refresh the student list and try again.'
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

