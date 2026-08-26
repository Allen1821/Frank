const { Resend } = require('resend');
const {
    checkRateLimit,
    getAdminAccessToken,
    getClientIp,
    getSupabaseConfig,
    isJsonRequest,
    pruneRateLimit,
    requireAdmin,
    requireCsrf,
    requireSameOrigin,
    sendJson,
    setAdminSecurityHeaders,
} = require('./_admin-utils');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CERTIFICATE_CODE_PATTERN = /^\d{4}$/;
const NOTIFICATION_WINDOW_MS = 60 * 60 * 1000;
const NOTIFICATION_MAX_SENDS = 10;
const notificationHits = new Map();

setInterval(function () {
    pruneRateLimit(notificationHits, NOTIFICATION_WINDOW_MS);
}, NOTIFICATION_WINDOW_MS).unref();

function cleanText(value) {
    return String(value || '').trim().replace(/\r\n?/g, '\n');
}

function isSafeMessage(value, min, max) {
    return value.length >= min && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildEmailHtml(student, message) {
    const name = escapeHtml(student.fullName || 'Student');
    const paragraphs = message.split(/\n{2,}/).map(function (paragraph) {
        return '<p style="margin:0 0 16px;line-height:1.65;color:#334155">'
            + escapeHtml(paragraph).replace(/\n/g, '<br>') + '</p>';
    }).join('');
    return '<div style="margin:0;background:#eef3f8;padding:28px 14px;font-family:Arial,sans-serif">'
        + '<div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #d9e2ec">'
        + '<div style="background:#0b1f3a;padding:22px 28px;color:#fff">'
        + '<strong style="font-size:16px;letter-spacing:.03em">DARPA SOLUTIONS LLC</strong>'
        + '<div style="margin-top:5px;color:#bdcce0;font-size:12px">Student portal notification</div></div>'
        + '<div style="padding:30px 28px"><p style="margin:0 0 16px;color:#0f233e;font-weight:700">Hello '
        + name + ',</p>' + paragraphs
        + '<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.55">'
        + 'This operational notice was sent from the DARPA SOLUTIONS LLC student portal. Reply to this email if you need help.'
        + '</p></div></div></div>';
}

function buildEmailText(student, message) {
    return 'Hello ' + (student.fullName || 'Student') + ',\n\n'
        + message + '\n\n— DARPA SOLUTIONS LLC\n'
        + 'This operational notice was sent from the student portal. Reply to this email if you need help.';
}

function certificateCodeForCourse(courseCode) {
    const match = String(courseCode || '').match(/(?:^|[^0-9])(\d{4})$/);
    return match ? match[1] : '';
}

async function fetchRows(config, accessToken, resourceAndQuery) {
    const rows = [];
    const pageSize = 500;
    for (let offset = 0; offset < 5000; offset += pageSize) {
        const separator = resourceAndQuery.includes('?') ? '&' : '?';
        const response = await fetch(
            config.url + '/rest/v1/' + resourceAndQuery + separator + 'limit=' + pageSize + '&offset=' + offset,
            {
                method: 'GET',
                headers: {
                    apikey: config.anonKey,
                    Authorization: 'Bearer ' + accessToken,
                },
                signal: AbortSignal.timeout(10000),
            }
        );
        if (!response.ok) throw Object.assign(new Error('Unable to read student recipients.'), { status: response.status });
        const page = await response.json();
        if (!Array.isArray(page)) throw new Error('Invalid student recipient response.');
        rows.push(...page);
        if (page.length < pageSize) break;
    }
    return rows;
}

async function fetchActiveStudents(config, accessToken, studentId, certificateCode) {
    const base = config.url + '/rest/v1/students?select=id,full_name,email&portal_active=eq.true';
    const headers = {
        apikey: config.anonKey,
        Authorization: 'Bearer ' + accessToken,
    };

    if (studentId) {
        const response = await fetch(base + '&id=eq.' + encodeURIComponent(studentId) + '&limit=1', {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw Object.assign(new Error('Unable to read student recipient.'), { status: response.status });
        return await response.json();
    }

    const rows = await fetchRows(config, accessToken, 'students?select=id,full_name,email&portal_active=eq.true&order=created_at.asc');
    if (!certificateCode) return rows;

    const enrollments = await fetchRows(
        config,
        accessToken,
        'student_enrollments?select=student_id,course_code,enrollment_status&enrollment_status=neq.cancelled'
    );
    const certificateStudentIds = new Set(enrollments
        .filter(function (enrollment) {
            return certificateCodeForCourse(enrollment.course_code) === certificateCode;
        })
        .map(function (enrollment) { return enrollment.student_id; }));
    return rows.filter(function (student) { return certificateStudentIds.has(student.id); });
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
    const rateKey = String(admin.id || admin.email || getClientIp(req));
    if (checkRateLimit(notificationHits, rateKey, NOTIFICATION_MAX_SENDS, NOTIFICATION_WINDOW_MS)) {
        return sendJson(res, 429, { success: false, error: 'Too many notification sends. Please wait and try again.' });
    }

    const body = req.body || {};
    const unknownFields = Object.keys(body).filter(function (key) {
        return !['scope', 'studentId', 'certificateCode', 'subject', 'message', 'requestId'].includes(key);
    });
    const scope = String(body.scope || '');
    const studentId = String(body.studentId || '').trim();
    const certificateCode = String(body.certificateCode || '').trim();
    const subject = cleanText(body.subject).replace(/\n+/g, ' ');
    const message = cleanText(body.message);
    const requestId = String(body.requestId || '').trim();
    if (
        JSON.stringify(body).length > 16384
        || unknownFields.length
        || !['all_active', 'certificate', 'student'].includes(scope)
        || (scope === 'student' && !UUID_PATTERN.test(studentId))
        || (scope !== 'student' && studentId)
        || (scope === 'certificate' && !CERTIFICATE_CODE_PATTERN.test(certificateCode))
        || (scope !== 'certificate' && certificateCode)
        || !isSafeMessage(subject, 3, 140)
        || !isSafeMessage(message, 10, 5000)
        || !UUID_PATTERN.test(requestId)
    ) {
        return sendJson(res, 400, { success: false, error: 'Check the recipients, subject, and message.' });
    }

    const config = getSupabaseConfig();
    const accessToken = getAdminAccessToken(req);
    const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
    if (!config || !accessToken || !resendApiKey) {
        return sendJson(res, 503, { success: false, error: 'Student notifications are not configured.' });
    }

    try {
        const rows = await fetchActiveStudents(
            config,
            accessToken,
            scope === 'student' ? studentId : '',
            scope === 'certificate' ? certificateCode : ''
        );
        const seenEmails = new Set();
        const recipients = rows.filter(function (row) {
            const email = String(row.email || '').trim().toLowerCase();
            if (!email || seenEmails.has(email)) return false;
            seenEmails.add(email);
            row.email = email;
            row.fullName = cleanText(row.full_name).replace(/\n+/g, ' ');
            return true;
        });
        if (!recipients.length) {
            return sendJson(res, 400, {
                success: false,
                error: scope === 'student'
                    ? 'That student is not currently active or has no email address.'
                    : scope === 'certificate'
                        ? 'There are no active students in that certificate group.'
                        : 'There are no active students to notify.',
            });
        }

        const resend = new Resend(resendApiKey);
        const from = String(process.env.STUDENT_NOTIFICATION_FROM || 'DARPA SOLUTIONS LLC <contact@darpasolutionsllc.net>').trim();
        const replyTo = String(process.env.STUDENT_NOTIFICATION_REPLY_TO || 'darpasolutionsllc@gmail.com').trim();
        let sent = 0;
        for (let index = 0; index < recipients.length; index += 100) {
            const batch = recipients.slice(index, index + 100).map(function (student) {
                return {
                    from,
                    to: [student.email],
                    replyTo,
                    subject,
                    html: buildEmailHtml(student, message),
                    text: buildEmailText(student, message),
                    tags: [
                        { name: 'audience', value: 'student' },
                        { name: 'scope', value: scope },
                        ...(certificateCode ? [{ name: 'certificate', value: certificateCode }] : []),
                    ],
                };
            });
            const result = await resend.batch.send(batch, {
                idempotencyKey: 'student-notice-' + requestId + '-' + Math.floor(index / 100),
            });
            if (result.error || !Array.isArray(result.data?.data)) {
                throw new Error(result.error?.message || 'Resend rejected the notification batch.');
            }
            sent += result.data.data.length;
        }

        return sendJson(res, 200, {
            success: true,
            sent,
            message: 'Notification sent to ' + sent + ' active student' + (sent === 1 ? '' : 's') + '.',
        });
    } catch (error) {
        console.error('Admin student notification error:', error instanceof Error ? error.message : 'unknown error');
        const forbidden = error?.status === 401 || error?.status === 403;
        return sendJson(res, forbidden ? 403 : 502, {
            success: false,
            error: forbidden
                ? 'This admin account cannot access student recipients.'
                : 'The notification could not be sent. No additional batches will be attempted.',
        });
    }
};
