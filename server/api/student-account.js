const {
    getSupabaseConfig,
    requireStudent,
    sendJson,
    setStudentSecurityHeaders,
} = require('./_student-utils');
const { createFolderDocumentToken, listDriveFolderTree } = require('./_google-drive');

async function readRows(config, accessToken, resourceAndQuery) {
    const response = await fetch(config.url + '/rest/v1/' + resourceAndQuery, {
        method: 'GET',
        headers: {
            apikey: config.publishableKey,
            Authorization: 'Bearer ' + accessToken,
        },
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
        const error = new Error('Supabase data request failed.');
        error.status = response.status;
        throw error;
    }
    return response.json();
}

function serializeDriveTreeItems(items, tokenSecret, studentId) {
    return (Array.isArray(items) ? items : []).map(function (item) {
        if (item.type === 'folder') {
            return {
                type: 'folder',
                name: item.name,
                mimeType: item.mimeType,
                truncated: Boolean(item.truncated),
                children: serializeDriveTreeItems(item.children, tokenSecret, studentId),
            };
        }

        const serialized = {
            type: 'file',
            name: item.name,
            mimeType: item.mimeType,
            previewable: Boolean(item.previewable),
            viewable: Boolean(item.viewable),
            downloadable: Boolean(item.downloadable),
        };
        serialized.id = 'folder_' + createFolderDocumentToken(tokenSecret, studentId, item.id);
        return serialized;
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
    const config = getSupabaseConfig();
    if (!config) {
        return sendJson(res, 503, { success: false, error: 'Student portal data is not configured.' });
    }

    try {
        const userId = encodeURIComponent(String(session.user.id || ''));
        const students = await readRows(
            config,
            session.accessToken,
            'students?select=id,student_number,full_name,email,phone,certification_number,renewal_status,renewal_date,renewal_due_date'
                + '&auth_user_id=eq.' + userId
                + '&portal_active=eq.true&limit=1'
        );
        if (!Array.isArray(students) || students.length !== 1) {
            return sendJson(res, 403, { success: false, error: 'This account does not have student portal access.' });
        }

        const student = students[0];
        const studentId = encodeURIComponent(student.id);
        const results = await Promise.all([
            readRows(
                config,
                session.accessToken,
                'student_enrollments?select=id,course_code,course_name,class_session,enrollment_status,enrolled_at'
                    + '&student_id=eq.' + studentId
                    + '&order=enrolled_at.desc&limit=100'
            ),
            readRows(
                config,
                session.accessToken,
                'student_documents?select=id,title,mime_type'
                    + '&student_id=eq.' + studentId
                    + '&order=display_order.asc&limit=100'
            ),
        ]);

        let driveFolder = null;
        let documentNotice = '';
        try {
            const folders = await readRows(
                config,
                session.accessToken,
                'student_drive_folders?select=title,google_drive_folder_id'
                    + '&student_id=eq.' + studentId
                    + '&limit=1'
            );
            if (Array.isArray(folders) && folders.length === 1) {
                const tree = await listDriveFolderTree(String(folders[0].google_drive_folder_id || ''));
                driveFolder = {
                    title: String(folders[0].title || tree.folder.name || 'Student Records'),
                    itemCount: tree.itemCount,
                    truncated: tree.truncated,
                    items: serializeDriveTreeItems(tree.items, session.accessToken, student.id),
                };
                if (tree.truncated) documentNotice = 'Some deeply nested folder items are not shown.';
            }
        } catch {
            documentNotice = 'Your private Drive folder is temporarily unavailable.';
        }

        return sendJson(res, 200, {
            success: true,
            student: {
                fullName: student.full_name,
                studentNumber: student.student_number,
                email: student.email || String(session.user.email || '').toLowerCase(),
                phone: student.phone,
                certificationNumber: student.certification_number,
                renewalStatus: student.renewal_status,
                renewalDate: student.renewal_date,
                renewalDueDate: student.renewal_due_date,
            },
            enrollments: results[0].map(function (row) {
                return {
                    id: row.id,
                    courseCode: row.course_code,
                    courseName: row.course_name,
                    classSession: row.class_session,
                    enrollmentStatus: row.enrollment_status,
                    enrolledAt: row.enrolled_at,
                };
            }),
            documents: results[1].map(function (row) {
                return { id: row.id, title: row.title, mimeType: row.mime_type };
            }),
            driveFolder,
            documentNotice,
        });
    } catch (error) {
        const status = error?.status === 404 ? 503 : 502;
        return sendJson(res, status, {
            success: false,
            error: status === 503
                ? 'Student portal data is not configured yet.'
                : 'Unable to load student information right now.',
        });
    }
};
