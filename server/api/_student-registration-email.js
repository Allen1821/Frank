const { Resend } = require('resend');

const COURSE_LABELS = Object.freeze({
    '6010': 'ASSE 6010 — Medical Gas Systems Installer/Brazer',
    '6020': 'ASSE 6020 — Medical Gas Systems Inspector',
    '6040': 'ASSE 6040 — Medical Gas Systems Maintenance Personnel',
    'recertification-6010': 'ASSE 6010 Recertification',
    'recertification-6020': 'ASSE 6020 Recertification',
    'recertification-6040': 'ASSE 6040 Recertification',
});

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function courseLabel(courseCode) {
    return COURSE_LABELS[courseCode] || String(courseCode || 'Class not specified');
}

function buildRegistrationEmailText(registration) {
    return [
        'New student account request',
        '',
        'A student created an account and is waiting for review.',
        '',
        'Student: ' + registration.fullName,
        'Email: ' + registration.email,
        'Class: ' + courseLabel(registration.courseCode),
        'Requested: ' + registration.requestedAt,
        '',
        'Review this request in the DARPA SOLUTIONS LLC Admin portal:',
        registration.adminUrl,
        '',
        'The student has not been granted portal access. Activate the account only after verifying the student and class.',
    ].join('\n');
}

function buildRegistrationEmailHtml(registration) {
    const safeName = escapeHtml(registration.fullName);
    const safeEmail = escapeHtml(registration.email);
    const safeCourse = escapeHtml(courseLabel(registration.courseCode));
    const safeRequestedAt = escapeHtml(registration.requestedAt);
    const safeAdminUrl = escapeHtml(registration.adminUrl);

    return '<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb;padding:28px 12px">'
        + '<tr><td align="center"><table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;overflow:hidden;border:1px solid #dbe3ee;border-radius:14px;background:#ffffff">'
        + '<tr><td style="padding:24px 28px;background:#1e40af;color:#ffffff">'
        + '<div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#bfdbfe">Student portal</div>'
        + '<div style="margin-top:7px;font-size:24px;font-weight:800;line-height:1.2">New account request</div>'
        + '</td></tr><tr><td style="padding:28px">'
        + '<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#475569">A student created an account and is waiting for Frank\'s review.</p>'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #dbe3ee;border-radius:9px;overflow:hidden">'
        + '<tr><td style="width:120px;padding:12px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-size:13px;font-weight:700;color:#475569">Student</td><td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:700">' + safeName + '</td></tr>'
        + '<tr><td style="width:120px;padding:12px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-size:13px;font-weight:700;color:#475569">Email</td><td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:14px"><a href="mailto:' + safeEmail + '" style="color:#1e40af">' + safeEmail + '</a></td></tr>'
        + '<tr><td style="width:120px;padding:12px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-size:13px;font-weight:700;color:#475569">Class</td><td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:14px">' + safeCourse + '</td></tr>'
        + '<tr><td style="width:120px;padding:12px 14px;background:#f8fafc;font-size:13px;font-weight:700;color:#475569">Requested</td><td style="padding:12px 14px;font-size:14px">' + safeRequestedAt + '</td></tr>'
        + '</table>'
        + '<p style="margin:22px 0 0"><a href="' + safeAdminUrl + '" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#1e40af;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">Review student request</a></p>'
        + '<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.55;color:#64748b">The student has not been granted portal access. Activate the account only after verifying the student and class.</p>'
        + '</td></tr></table></td></tr></table></body></html>';
}

async function sendStudentRegistrationEmail(registration, options) {
    const settings = options || {};
    const apiKey = String(settings.apiKey || process.env.RESEND_API_KEY || '').trim();
    if (!apiKey) {
        return { sent: false, reason: 'missing_api_key' };
    }

    const recipient = String(
        settings.recipient
        || process.env.STUDENT_REGISTRATION_NOTIFY_TO
        || process.env.STUDENT_NOTIFICATION_REPLY_TO
        || 'darpasolutionsllc@gmail.com'
    ).trim();
    const from = String(
        settings.from
        || process.env.STUDENT_NOTIFICATION_FROM
        || 'DARPA SOLUTIONS LLC <contact@darpasolutionsllc.net>'
    ).trim();
    const resend = settings.resend || new Resend(apiKey);
    const result = await resend.emails.send({
        from,
        to: [recipient],
        replyTo: registration.email,
        subject: 'New student request — ' + registration.fullName + ' — ' + courseLabel(registration.courseCode),
        text: buildRegistrationEmailText(registration),
        html: buildRegistrationEmailHtml(registration),
        tags: [
            { name: 'event', value: 'student_registration' },
            { name: 'course', value: registration.courseCode },
        ],
    }, {
        idempotencyKey: 'student-registration-' + registration.userId,
    });

    if (result.error || !result.data?.id) {
        throw new Error(result.error?.message || 'Resend rejected the registration notification.');
    }
    return { sent: true, id: result.data.id, recipient };
}

module.exports = {
    COURSE_LABELS,
    buildRegistrationEmailHtml,
    buildRegistrationEmailText,
    courseLabel,
    sendStudentRegistrationEmail,
};
