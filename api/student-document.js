const {
    createFolderDocumentToken,
    fetchDriveFile,
    flattenDriveFolderItems,
    listDriveFolderTree,
    MAX_FILE_BYTES,
} = require('./_google-drive');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const {
    getSupabaseConfig,
    requireStudent,
    sendJson,
    setStudentSecurityHeaders,
} = require('./_student-utils');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FOLDER_DOCUMENT_PATTERN = /^folder_[A-Za-z0-9_-]{43}$/;

function contentDisposition(mode, filename) {
    const type = mode === 'download' ? 'attachment' : 'inline';
    const safeAscii = String(filename || 'student-file')
        .replace(/[^\x20-\x7e]/g, '_')
        .replace(/["\\]/g, '_')
        .slice(0, 180) || 'student-file';
    return type
        + '; filename="' + safeAscii + '"'
        + "; filename*=UTF-8''" + encodeURIComponent(String(filename || 'student-file'));
}

function enforceStreamLimit(maxBytes) {
    let received = 0;
    return new Transform({
        transform(chunk, encoding, callback) {
            received += chunk.length;
            if (received > maxBytes) {
                const error = new Error('Drive file is too large.');
                error.code = 'DRIVE_FILE_TOO_LARGE';
                callback(error);
                return;
            }
            callback(null, chunk);
        },
    });
}

module.exports = async function handler(req, res) {
    setStudentSecurityHeaders(res);
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return sendJson(res, 405, { success: false, error: 'Method not allowed.' });
    }

    const session = await requireStudent(req, res);
    if (!session) return;
    const documentId = String(req.query?.id || '').trim();
    const mode = String(req.query?.mode || 'view').trim().toLowerCase();
    if (!UUID_PATTERN.test(documentId) && !FOLDER_DOCUMENT_PATTERN.test(documentId)) {
        return sendJson(res, 400, { success: false, error: 'Invalid document request.' });
    }
    if (!['view', 'download'].includes(mode)) {
        return sendJson(res, 400, { success: false, error: 'Invalid document mode.' });
    }

    const config = getSupabaseConfig();
    if (!config) {
        return sendJson(res, 503, { success: false, error: 'Student documents are not configured.' });
    }

    try {
        const userId = encodeURIComponent(String(session.user.id || ''));
        const studentResponse = await fetch(
            config.url + '/rest/v1/students?select=id'
                + '&auth_user_id=eq.' + userId
                + '&portal_active=eq.true&limit=1',
            {
                headers: {
                    apikey: config.publishableKey,
                    Authorization: 'Bearer ' + session.accessToken,
                },
                signal: AbortSignal.timeout(10000),
            }
        );
        if (!studentResponse.ok) throw new Error('Unable to authorize student document.');
        const students = await studentResponse.json();
        if (!Array.isArray(students) || students.length !== 1) {
            return sendJson(res, 404, { success: false, error: 'Document not found.' });
        }

        let driveFileId = '';
        if (FOLDER_DOCUMENT_PATTERN.test(documentId)) {
            const folderResponse = await fetch(
                config.url + '/rest/v1/student_drive_folders?select=google_drive_folder_id'
                    + '&student_id=eq.' + encodeURIComponent(students[0].id)
                    + '&limit=1',
                {
                    headers: {
                        apikey: config.publishableKey,
                        Authorization: 'Bearer ' + session.accessToken,
                    },
                    signal: AbortSignal.timeout(10000),
                }
            );
            if (!folderResponse.ok) throw new Error('Unable to authorize student folder.');
            const folders = await folderResponse.json();
            if (!Array.isArray(folders) || folders.length !== 1) {
                return sendJson(res, 404, { success: false, error: 'Document not found.' });
            }

            const driveFolder = await listDriveFolderTree(String(folders[0].google_drive_folder_id || ''));
            const opaqueToken = documentId.slice('folder_'.length);
            const matchedFile = flattenDriveFolderItems(driveFolder.items).find(function (file) {
                if (file.type !== 'file') return false;
                return createFolderDocumentToken(session.accessToken, students[0].id, file.id) === opaqueToken;
            });
            if (!matchedFile) {
                return sendJson(res, 404, { success: false, error: 'Document not found.' });
            }
            driveFileId = matchedFile.id;
        } else {
            const documentResponse = await fetch(
                config.url + '/rest/v1/student_documents?select=google_drive_file_id,mime_type'
                    + '&id=eq.' + encodeURIComponent(documentId)
                    + '&student_id=eq.' + encodeURIComponent(students[0].id)
                    + '&limit=1',
                {
                    headers: {
                        apikey: config.publishableKey,
                        Authorization: 'Bearer ' + session.accessToken,
                    },
                    signal: AbortSignal.timeout(10000),
                }
            );
            if (!documentResponse.ok) throw new Error('Unable to authorize student document.');
            const documents = await documentResponse.json();
            if (!Array.isArray(documents) || documents.length !== 1) {
                return sendJson(res, 404, { success: false, error: 'Document not found.' });
            }
            driveFileId = String(documents[0].google_drive_file_id || '');
        }

        const file = await fetchDriveFile(driveFileId, mode);
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', contentDisposition(mode, file.filename));
        if (file.contentLength) res.setHeader('Content-Length', String(file.contentLength));
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        res.statusCode = 200;
        await pipeline(file.stream, enforceStreamLimit(MAX_FILE_BYTES), res);
        return;
    } catch (error) {
        if (res.headersSent) {
            if (!res.writableEnded) res.destroy(error);
            return;
        }
        if (error?.code === 'DRIVE_NOT_CONFIGURED') {
            return sendJson(res, 503, { success: false, error: 'Student document viewer is not configured yet.' });
        }
        if ([
            'DRIVE_FILE_NOT_FOUND',
            'UNSUPPORTED_DRIVE_FILE',
            'DRIVE_FILE_NOT_VIEWABLE',
            'INVALID_DRIVE_FILE',
            'DRIVE_FILE_TOO_LARGE',
            'DRIVE_FOLDER_NOT_FOUND',
            'NOT_A_DRIVE_FOLDER',
            'INVALID_DRIVE_FOLDER',
        ].includes(error?.code)) {
            const status = error?.code === 'DRIVE_FILE_NOT_VIEWABLE' ? 415 : 404;
            return sendJson(res, status, {
                success: false,
                error: status === 415 ? 'This file can be downloaded but not viewed in the browser.' : 'Document not found.',
            });
        }
        console.error('Student document error:', error instanceof Error ? error.message : 'unknown error');
        return sendJson(res, 502, { success: false, error: 'Unable to display this document right now.' });
    }
};
