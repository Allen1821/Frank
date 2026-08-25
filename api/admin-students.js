const {
    getAdminAccessToken,
    getSupabaseConfig,
    requireAdmin,
    sendJson,
    setAdminSecurityHeaders,
} = require('./_admin-utils');
const { getGoogleServiceAccountEmail } = require('./_google-drive');

async function readRows(config, accessToken, resourceAndQuery) {
    const response = await fetch(config.url + '/rest/v1/' + resourceAndQuery, {
        method: 'GET',
        headers: {
            apikey: config.anonKey,
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

module.exports = async function handler(req, res) {
    setAdminSecurityHeaders(res);
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return sendJson(res, 405, { success: false, error: 'Method not allowed.' });
    }

    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const config = getSupabaseConfig();
    const accessToken = getAdminAccessToken(req);
    if (!config || !accessToken) {
        return sendJson(res, 503, { success: false, error: 'Student data access is not configured.' });
    }

    try {
        const results = await Promise.all([
            readRows(
                config,
                accessToken,
                'students?select=id,student_number,full_name,email,renewal_status,renewal_date,renewal_due_date,portal_active,portal_deactivated_at,created_at'
                    + '&order=created_at.desc&limit=1000'
            ),
            readRows(
                config,
                accessToken,
                'student_enrollments?select=id,student_id,course_code,course_name,class_session,enrollment_status,enrolled_at'
                    + '&order=enrolled_at.desc&limit=2000'
            ),
            readRows(
                config,
                accessToken,
                'student_documents?select=id,student_id,title,mime_type,created_at'
                    + '&order=created_at.desc&limit=2000'
            ),
            readRows(
                config,
                accessToken,
                'student_drive_folders?select=id,student_id,title,created_at,updated_at'
                    + '&order=updated_at.desc&limit=1000'
            ),
        ]);

        const students = Array.isArray(results[0]) ? results[0] : [];
        const enrollments = Array.isArray(results[1]) ? results[1] : [];
        const documents = Array.isArray(results[2]) ? results[2] : [];
        const driveFolders = Array.isArray(results[3]) ? results[3] : [];
        const byStudent = new Map();
        enrollments.forEach(function (enrollment) {
            if (!byStudent.has(enrollment.student_id)) byStudent.set(enrollment.student_id, []);
            byStudent.get(enrollment.student_id).push(enrollment);
        });
        const documentsByStudent = new Map();
        documents.forEach(function (document) {
            if (!documentsByStudent.has(document.student_id)) documentsByStudent.set(document.student_id, []);
            documentsByStudent.get(document.student_id).push({
                id: document.id,
                title: document.title,
                mimeType: document.mime_type,
                createdAt: document.created_at,
            });
        });
        const folderByStudent = new Map();
        driveFolders.forEach(function (folder) {
            folderByStudent.set(folder.student_id, {
                id: folder.id,
                title: folder.title,
                createdAt: folder.created_at,
                updatedAt: folder.updated_at,
            });
        });

        const countMap = new Map();
        enrollments
            .filter(function (enrollment) { return enrollment.enrollment_status !== 'cancelled'; })
            .forEach(function (enrollment) {
                const courseCode = enrollment.course_code || 'Unassigned';
                const classSession = enrollment.class_session || 'Session not scheduled';
                const key = courseCode + '\u0000' + classSession;
                const existing = countMap.get(key) || {
                    courseCode,
                    courseName: enrollment.course_name || courseCode,
                    classSession,
                    studentIds: new Set(),
                };
                existing.studentIds.add(enrollment.student_id);
                countMap.set(key, existing);
            });

        const studentRecords = students.map(function (student) {
            return {
                id: student.id,
                studentNumber: student.student_number,
                fullName: student.full_name,
                email: student.email,
                renewalStatus: student.renewal_status,
                renewalDate: student.renewal_date,
                renewalDueDate: student.renewal_due_date,
                portalActive: student.portal_active,
                portalDeactivatedAt: student.portal_deactivated_at,
                createdAt: student.created_at,
                enrollments: (byStudent.get(student.id) || []).map(function (enrollment) {
                    return {
                        id: enrollment.id,
                        courseCode: enrollment.course_code,
                        courseName: enrollment.course_name,
                        classSession: enrollment.class_session,
                        enrollmentStatus: enrollment.enrollment_status,
                        enrolledAt: enrollment.enrolled_at,
                    };
                }),
                documents: documentsByStudent.get(student.id) || [],
                driveFolder: folderByStudent.get(student.id) || null,
            };
        });

        const rows = [];
        studentRecords.forEach(function (student) {
            const studentEnrollments = student.enrollments.length ? student.enrollments : [null];
            studentEnrollments.forEach(function (enrollment) {
                rows.push({
                    id: student.id,
                    studentNumber: student.studentNumber,
                    fullName: student.fullName,
                    email: student.email,
                    renewalStatus: student.renewalStatus,
                    renewalDate: student.renewalDate,
                    renewalDueDate: student.renewalDueDate,
                    portalActive: student.portalActive,
                    portalDeactivatedAt: student.portalDeactivatedAt,
                    createdAt: student.createdAt,
                    courseCode: enrollment?.courseCode || '',
                    courseName: enrollment?.courseName || '',
                    classSession: enrollment?.classSession || '',
                    enrollmentStatus: enrollment?.enrollmentStatus || '',
                    enrolledAt: enrollment?.enrolledAt || null,
                });
            });
        });

        return sendJson(res, 200, {
            success: true,
            totalStudents: students.length,
            activePortalStudents: students.filter(function (student) { return student.portal_active; }).length,
            pendingStudents: students.filter(function (student) {
                return !student.portal_active && !student.portal_deactivated_at;
            }).length,
            deactivatedPortalStudents: students.filter(function (student) {
                return !student.portal_active && Boolean(student.portal_deactivated_at);
            }).length,
            driveServiceAccountEmail: getGoogleServiceAccountEmail(),
            classCounts: Array.from(countMap.values()).map(function (item) {
                return {
                    courseCode: item.courseCode,
                    courseName: item.courseName,
                    classSession: item.classSession,
                    count: item.studentIds.size,
                };
            }).sort(function (a, b) {
                return a.courseCode.localeCompare(b.courseCode)
                    || a.classSession.localeCompare(b.classSession);
            }),
            students: studentRecords,
            rows,
        });
    } catch (error) {
        const status = error?.status === 404 ? 503 : error?.status === 403 ? 403 : 502;
        return sendJson(res, status, {
            success: false,
            error: status === 503
                ? 'Student database tables are not configured yet.'
                : status === 403
                    ? 'This admin account has not been granted student roster access.'
                    : 'Unable to load student data right now.',
        });
    }
};
