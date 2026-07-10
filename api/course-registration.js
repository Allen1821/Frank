// =====================================================================
// DARPA SOLUTIONS LLC - Course Registration API (Vercel Serverless)
// Sends ASSE course and recertification registration roster submissions via Resend.
// =====================================================================

const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');

const CONTENT_PATH = path.join(process.cwd(), 'content/site-content.json');

function getResendClient() {
    const apiKey = (process.env.RESEND_API_KEY || '').trim();
    if (!apiKey) return null;
    return new Resend(apiKey);
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const ipHits = new Map();

function isRateLimited(ip) {
    const now = Date.now();
    const entry = ipHits.get(ip);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        ipHits.set(ip, { windowStart: now, count: 1 });
        return false;
    }
    entry.count += 1;
    return entry.count > RATE_LIMIT_MAX;
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipHits) {
        if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) ipHits.delete(ip);
    }
}, RATE_LIMIT_WINDOW_MS).unref();

const COURSE_LABELS = {
    '6010': 'ASSE 6010 - Medical Gas Installer/Brazer Piping Installers',
    '6020': 'ASSE 6020 - Medical Gas Inspectors',
    '6040': 'ASSE 6040 - Medical Gas Maintenance Personnel',
    'recertification-6010': 'ASSE 6010 Recertification - 4-Hour Class and Test',
    'recertification-6020': 'ASSE 6020 Recertification - 4-Hour Class and Test',
    'recertification-6040': 'ASSE 6040 Recertification - 4-Hour Class and Test',
};

const ALLOWED_FIELDS = new Set([
    'course_code',
    'company_name',
    'company_contact',
    'company_email',
    'company_phone',
    'company_address',
    'company_city',
    'company_state',
    'company_zip',
    'course_session',
    'student_count',
    'website',
    'students',
]);
const ALLOWED_STUDENT_FIELDS = new Set([
    'name',
    'ssn_last4',
    'home_address',
    'city',
    'state',
    'zip',
    'phone',
    'cell',
    'email',
]);

const DEFAULT_DATE_GROUPS = [
    {
        courseCodes: ['6010'],
        dates: [
            { id: '2026-08-03', label: 'August 3, 4, and 5, 2026', note: 'Monday-Wednesday' },
            { id: '2026-10-05', label: 'October 5, 6, and 7, 2026', note: 'Monday-Wednesday' },
            { id: '2027-01-11', label: 'January 11, 12, and 13, 2027', note: 'Monday-Wednesday' },
        ],
    },
    {
        courseCodes: ['6020'],
        dates: [
            { id: '2026-08-03', label: 'August 3, 4, and 5, 2026', note: 'Monday-Wednesday' },
            { id: '2026-10-05', label: 'October 5, 6, and 7, 2026', note: 'Monday-Wednesday' },
            { id: '2027-01-11', label: 'January 11, 12, and 13, 2027', note: 'Monday-Wednesday' },
        ],
    },
    {
        courseCodes: ['6040'],
        dates: [
            { id: '2026-08-03', label: 'August 3, 4, and 5, 2026', note: 'Monday-Wednesday' },
            { id: '2026-10-05', label: 'October 5, 6, and 7, 2026', note: 'Monday-Wednesday' },
            { id: '2027-01-11', label: 'January 11, 12, and 13, 2027', note: 'Monday-Wednesday' },
        ],
    },
    {
        courseCodes: ['recertification-6010', 'recertification-6020', 'recertification-6040'],
        dates: [
            { id: 'recertification-tbd', label: 'Dates to be announced', note: '4-hour recertification class plus test' },
        ],
    },
];

function sessionValue(date) {
    const id = sanitise(String(date?.id || ''));
    const label = sanitise(String(date?.label || ''));
    return id && label ? id + '|' + label : '';
}

function sessionLabel(date) {
    const label = sanitise(String(date?.label || ''));
    const note = sanitise(String(date?.note || ''));
    return note ? label + ' - ' + note : label;
}

async function loadDateGroups() {
    try {
        const raw = await fs.promises.readFile(CONTENT_PATH, 'utf8');
        const content = JSON.parse(raw);
        if (content && Array.isArray(content.dateGroups)) return content.dateGroups;
    } catch (err) {
        console.error('Course date content read failed:', err);
    }

    return DEFAULT_DATE_GROUPS;
}

async function loadCourseSessionsByCourse() {
    const byCourse = Object.create(null);
    const groups = await loadDateGroups();

    groups.forEach(group => {
        if (!group || !Array.isArray(group.courseCodes) || !Array.isArray(group.dates)) return;

        group.courseCodes.forEach(courseCode => {
            const safeCourseCode = sanitise(String(courseCode || ''));
            if (!COURSE_LABELS[safeCourseCode]) return;
            if (!byCourse[safeCourseCode]) byCourse[safeCourseCode] = Object.create(null);

            group.dates.forEach(date => {
                const value = sessionValue(date);
                const label = sessionLabel(date);
                if (value && label) byCourse[safeCourseCode][value] = label;
            });
        });
    });

    return byCourse;
}

function sanitise(value) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ');
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isValidEmail(email) {
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(email);
}

function isValidPhone(phone) {
    if (!/^[0-9+()\-.\s]+$/.test(phone)) return false;
    const digits = (phone.match(/\d/g) || []).length;
    return digits >= 7 && digits <= 15;
}

function isValidZip(zip) {
    return /^\d{5}(?:-\d{4})?$/.test(zip);
}

function isValidState(state) {
    return /^[A-Za-z .-]{2,20}$/.test(state) && /[A-Za-z]/.test(state);
}

function isValidCity(city) {
    return /^[A-Za-z .'-]{2,80}$/.test(city) && /[A-Za-z]/.test(city);
}

function isValidName(name) {
    const letters = name.match(/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/g);
    return letters && letters.length >= 2;
}

function containsControlChars(str) {
    return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(str);
}

function containsHtmlSyntax(str) {
    return /[<>]|&(?:lt|gt|#60|#62|#x3c|#x3e);/i.test(str);
}

function containsLink(str) {
    return /https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|co|us|info|biz|gov|edu|dev|app|me|tv|cc|xyz|site|online|store|tech|cloud|pro)\b/i.test(str);
}

function containsSqlInjectionPattern(str) {
    const value = String(str).toLowerCase();
    return /(?:--|\/\*|\*\/|;)/.test(value)
        || /\b(union\s+select|select\s+.+\s+from|insert\s+into|update\s+\w+\s+set|delete\s+from|drop\s+table|alter\s+table|create\s+table|exec(?:ute)?\s+|xp_cmdshell)\b/i.test(value)
        || /(?:'|")?\s+or\s+(?:'|")?\d+(?:'|")?\s*=\s*(?:'|")?\d+/i.test(value);
}

function normaliseStudents(students) {
    if (!Array.isArray(students)) return [];

    return students.slice(0, 20).map(student => {
        const source = student && typeof student === 'object' ? student : {};
        const unknownFields = Object.keys(source).filter(key => !ALLOWED_STUDENT_FIELDS.has(key));
        if (unknownFields.length > 0) return { __unknownFields: unknownFields };

        return {
            name: sanitise(source.name || ''),
            ssn_last4: sanitise(source.ssn_last4 || ''),
            home_address: sanitise(source.home_address || ''),
            city: sanitise(source.city || ''),
            state: sanitise(source.state || ''),
            zip: sanitise(source.zip || ''),
            phone: sanitise(source.phone || ''),
            cell: sanitise(source.cell || ''),
            email: sanitise(source.email || ''),
        };
    });
}

function buildStudentRows(students) {
    return students.map((student, index) => `
        <tr>
            <td style="border-bottom:1px solid #e2e8f0; padding:12px; vertical-align:top; font-weight:700; color:#0f172a;">${index + 1}</td>
            <td style="border-bottom:1px solid #e2e8f0; padding:12px; vertical-align:top;">
                <div style="font-weight:700; color:#0f172a;">${escapeHtml(student.name)}</div>
                <div style="font-size:12px; color:#64748b; margin-top:3px;">Last four SSN: ${escapeHtml(student.ssn_last4)}</div>
            </td>
            <td style="border-bottom:1px solid #e2e8f0; padding:12px; vertical-align:top; color:#0f172a;">
                ${escapeHtml(student.home_address)}<br />
                ${escapeHtml(student.city)}, ${escapeHtml(student.state)} ${escapeHtml(student.zip)}
            </td>
            <td style="border-bottom:1px solid #e2e8f0; padding:12px; vertical-align:top; color:#0f172a;">
                Phone: ${escapeHtml(student.phone)}<br />
                Cell: ${escapeHtml(student.cell || 'N/A')}<br />
                Email: ${escapeHtml(student.email)}
            </td>
        </tr>
    `).join('');
}

function buildEmailHtml(data) {
    const safeCourse = escapeHtml(COURSE_LABELS[data.course_code]);
    const studentRows = buildStudentRows(data.students);

    return `<!doctype html>
<html>
<body style="margin:0; padding:0; background:#f3f6fb; font-family:Arial, Helvetica, sans-serif; color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb; padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="760" cellpadding="0" cellspacing="0" style="width:760px; max-width:94%; background:#ffffff; border:1px solid #dbe3ee; border-radius:12px; overflow:hidden;">
          <tr>
            <td style="background:#1e40af; color:#ffffff; padding:24px 28px;">
              <div style="font-size:22px; font-weight:700; line-height:1.25;">New Course Registration</div>
              <div style="font-size:14px; opacity:0.94; margin-top:7px;">${safeCourse}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 14px;">
              <div style="font-size:16px; font-weight:700; margin-bottom:12px;">Company Info</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #dbe3ee; border-radius:8px; overflow:hidden;">
                <tr>
                  <td style="width:170px; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:10px 12px; font-weight:700;">Company</td>
                  <td style="border-bottom:1px solid #e2e8f0; padding:10px 12px;">${escapeHtml(data.company_name)}</td>
                </tr>
                <tr>
                  <td style="width:170px; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:10px 12px; font-weight:700;">Contact</td>
                  <td style="border-bottom:1px solid #e2e8f0; padding:10px 12px;">${escapeHtml(data.company_contact)}</td>
                </tr>
                <tr>
                  <td style="width:170px; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:10px 12px; font-weight:700;">Email</td>
                  <td style="border-bottom:1px solid #e2e8f0; padding:10px 12px;">${escapeHtml(data.company_email)}</td>
                </tr>
                <tr>
                  <td style="width:170px; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:10px 12px; font-weight:700;">Phone</td>
                  <td style="border-bottom:1px solid #e2e8f0; padding:10px 12px;">${escapeHtml(data.company_phone)}</td>
                </tr>
                <tr>
                  <td style="width:170px; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:10px 12px; font-weight:700;">Address</td>
                  <td style="border-bottom:1px solid #e2e8f0; padding:10px 12px;">${escapeHtml(data.company_address)}<br />${escapeHtml(data.company_city)}, ${escapeHtml(data.company_state)} ${escapeHtml(data.company_zip)}</td>
                </tr>
                <tr>
                  <td style="width:170px; background:#f8fafc; padding:10px 12px; font-weight:700;">Class Dates</td>
                  <td style="padding:10px 12px;">${escapeHtml(data.course_session_label)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;">
              <div style="font-size:16px; font-weight:700; margin-bottom:12px;">Student Roster (${data.students.length})</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #dbe3ee; border-radius:8px; overflow:hidden;">
                <tr>
                  <th align="left" style="width:42px; background:#f8fafc; border-bottom:1px solid #dbe3ee; padding:10px 12px; color:#334155;">#</th>
                  <th align="left" style="background:#f8fafc; border-bottom:1px solid #dbe3ee; padding:10px 12px; color:#334155;">Student</th>
                  <th align="left" style="background:#f8fafc; border-bottom:1px solid #dbe3ee; padding:10px 12px; color:#334155;">Address</th>
                  <th align="left" style="background:#f8fafc; border-bottom:1px solid #dbe3ee; padding:10px 12px; color:#334155;">Contact</th>
                </tr>
                ${studentRows}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    const resend = getResendClient();
    if (!resend) {
        return res.status(500).json({ success: false, error: 'Server email configuration is missing. Add RESEND_API_KEY and restart.' });
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ success: false, error: 'Method not allowed.' });
    }

    const contentType = (req.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('application/json')) {
        return res.status(400).json({ success: false, error: 'Content-Type must be application/json.' });
    }

    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                   || req.socket?.remoteAddress
                   || 'unknown';
    if (isRateLimited(clientIp)) {
        return res.status(429).json({ success: false, error: 'Too many submissions. Please wait a few minutes and try again.' });
    }

    const rawBody = JSON.stringify(req.body || {});
    if (rawBody.length > 50000) {
        return res.status(400).json({ success: false, error: 'Request payload is too large.' });
    }

    const body = req.body || {};
    const unknownFields = Object.keys(body).filter(key => !ALLOWED_FIELDS.has(key));
    if (unknownFields.length > 0) {
        return res.status(400).json({ success: false, error: 'Unexpected fields in request.' });
    }

    if (body.website) {
        return res.status(200).json({ success: true });
    }

    const course_code = sanitise(String(body.course_code || ''));
    const company_name = sanitise(String(body.company_name || ''));
    const company_contact = sanitise(String(body.company_contact || ''));
    const company_email = sanitise(String(body.company_email || ''));
    const company_phone = sanitise(String(body.company_phone || ''));
    const company_address = sanitise(String(body.company_address || ''));
    const company_city = sanitise(String(body.company_city || ''));
    const company_state = sanitise(String(body.company_state || ''));
    const company_zip = sanitise(String(body.company_zip || ''));
    const course_session = sanitise(String(body.course_session || ''));
    const isRecertificationCourse = course_code.startsWith('recertification-');
    const courseSessionsByCourse = await loadCourseSessionsByCourse();
    const allowedCourseSessions = courseSessionsByCourse[course_code] || {};
    const course_session_label = allowedCourseSessions[course_session] || '';
    const requestedStudentCount = Number(body.student_count || 0);
    const students = normaliseStudents(body.students);
    const errors = [];

    if (!COURSE_LABELS[course_code]) errors.push('Invalid course selection.');

    if (!company_name) errors.push('Company name is required.');
    else if (company_name.length > 140) errors.push('Company name must be 140 characters or fewer.');

    if (!company_contact) errors.push('Company contact is required.');
    else if (company_contact.length > 100) errors.push('Company contact must be 100 characters or fewer.');
    else if (!isValidName(company_contact)) errors.push('Company contact must contain letters.');

    if (!company_email) errors.push('Company email is required.');
    else if (!isValidEmail(company_email)) errors.push('Please provide a valid company email.');

    if (!company_phone) errors.push('Company phone number is required.');
    else if (!isValidPhone(company_phone)) errors.push('Please provide a valid company phone number.');

    if (!company_address) errors.push('Company street address is required.');
    else if (company_address.length > 160) errors.push('Company street address must be 160 characters or fewer.');

    if (!company_city) errors.push('Company city is required.');
    else if (company_city.length > 80) errors.push('Company city must be 80 characters or fewer.');
    else if (!isValidCity(company_city)) errors.push('Company city may only include letters, spaces, periods, hyphens, or apostrophes.');

    if (!company_state) errors.push('Company state is required.');
    else if (company_state.length > 20) errors.push('Company state must be 20 characters or fewer.');
    else if (!isValidState(company_state)) errors.push('Company state may only include letters, spaces, periods, or hyphens.');

    if (!company_zip) errors.push('Company zip code is required.');
    else if (company_zip.length > 10) errors.push('Company zip code must be 10 characters or fewer.');
    else if (!isValidZip(company_zip)) errors.push('Company zip code must be 5 digits or ZIP+4 format, like 33913 or 33913-1234.');

    if (!course_session_label) {
        errors.push(isRecertificationCourse
            ? 'Please choose one available recertification date.'
            : 'Please choose one available 3-day class date.');
    }

    if (!Number.isInteger(requestedStudentCount) || requestedStudentCount < 1 || requestedStudentCount > 20) {
        errors.push('Student count must be between 1 and 20.');
    }

    if (students.length < 1) errors.push('At least one student is required.');
    if (students.length > 20) errors.push('A maximum of 20 students can be submitted at once.');
    if (requestedStudentCount && students.length !== requestedStudentCount) {
        errors.push('Student count does not match the roster.');
    }

    students.forEach((student, index) => {
        const label = 'Student ' + (index + 1);

        if (student.__unknownFields) {
            errors.push(label + ' contains unexpected fields.');
            return;
        }

        if (!student.name) errors.push(label + ' name is required.');
        else if (student.name.length > 100) errors.push(label + ' name must be 100 characters or fewer.');
        else if (!isValidName(student.name)) errors.push(label + ' name must contain letters.');

        if (!/^\d{4}$/.test(student.ssn_last4)) errors.push(label + ' must include exactly four SSN digits.');

        if (!student.home_address) errors.push(label + ' home address is required.');
        else if (student.home_address.length > 160) errors.push(label + ' home address must be 160 characters or fewer.');

        if (!student.city) errors.push(label + ' city is required.');
        else if (student.city.length > 80) errors.push(label + ' city must be 80 characters or fewer.');
        else if (!isValidCity(student.city)) errors.push(label + ' city may only include letters, spaces, periods, hyphens, or apostrophes.');

        if (!student.state) errors.push(label + ' state is required.');
        else if (student.state.length > 20) errors.push(label + ' state must be 20 characters or fewer.');
        else if (!isValidState(student.state)) errors.push(label + ' state may only include letters, spaces, periods, or hyphens.');

        if (!student.zip) errors.push(label + ' zip is required.');
        else if (student.zip.length > 10) errors.push(label + ' zip must be 10 characters or fewer.');
        else if (!isValidZip(student.zip)) errors.push(label + ' zip must be 5 digits or ZIP+4 format, like 33913 or 33913-1234.');

        if (!student.phone) errors.push(label + ' phone number is required.');
        else if (!isValidPhone(student.phone)) errors.push(label + ' phone number is invalid.');

        if (student.cell && !isValidPhone(student.cell)) errors.push(label + ' cell number is invalid.');

        if (!student.email) errors.push(label + ' email is required.');
        else if (!isValidEmail(student.email)) errors.push(label + ' email is invalid.');
    });

    const allTextValues = [
        course_code,
        company_name,
        company_contact,
        company_email,
        company_phone,
        company_address,
        company_city,
        company_state,
        company_zip,
        course_session,
        ...students.flatMap(student => Object.values(student).filter(value => typeof value === 'string')),
    ];

    if (allTextValues.some(value => containsControlChars(value))) {
        errors.push('Invalid control characters were detected in the submission.');
    }

    const textValuesNoEmail = [
        company_name,
        company_contact,
        company_phone,
        company_address,
        company_city,
        company_state,
        company_zip,
        ...students.flatMap(student => [
            student.name,
            student.ssn_last4,
            student.home_address,
            student.city,
            student.state,
            student.zip,
            student.phone,
            student.cell,
        ]),
    ];

    const linkCheckValues = [
        company_name,
        company_contact,
        company_address,
        company_city,
        company_state,
        company_zip,
        ...students.flatMap(student => [
            student.name,
            student.home_address,
            student.city,
            student.state,
            student.zip,
        ]),
    ];

    if (allTextValues.some(value => containsHtmlSyntax(value))) {
        errors.push('HTML tags or encoded HTML are not allowed.');
    }

    if (linkCheckValues.some(value => containsLink(value))) {
        errors.push('Links and website addresses are not allowed in registration fields.');
    }

    if (textValuesNoEmail.some(value => containsSqlInjectionPattern(value))) {
        errors.push('The submission contains unsafe database-style input. Please remove SQL keywords, comments, or special command syntax.');
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    const emailData = {
        course_code,
        company_name,
        company_contact,
        company_email,
        company_phone,
        company_address,
        company_city,
        company_state,
        company_zip,
        course_session_label,
        students,
    };

    const emailText = [
        'New Course Registration',
        '========================================',
        'Course: ' + COURSE_LABELS[course_code],
        '',
        'Company Info',
        '----------------------------------------',
        'Company: ' + company_name,
        'Contact: ' + company_contact,
        'Email: ' + company_email,
        'Phone: ' + company_phone,
        'Address: ' + company_address + ', ' + company_city + ', ' + company_state + ' ' + company_zip,
        'Class Dates: ' + course_session_label,
        '',
        'Student Roster (' + students.length + ')',
        '----------------------------------------',
        ...students.map((student, index) => [
            (index + 1) + '. ' + student.name,
            '   Last four SSN: ' + student.ssn_last4,
            '   Address: ' + student.home_address + ', ' + student.city + ', ' + student.state + ' ' + student.zip,
            '   Phone: ' + student.phone,
            '   Cell: ' + (student.cell || 'N/A'),
            '   Email: ' + student.email,
        ].join('\n')),
    ].join('\n');

    try {
        const sendResult = await resend.emails.send({
            from: 'DARPA SOLUTIONS LLC <contact@darpasolutionsllc.net>',
            to: 'darpasolutionsllc@gmail.com',
            replyTo: company_email,
            subject: '[Course Registration] ' + course_code + ' - ' + company_name + ' (' + students.length + ' student' + (students.length === 1 ? '' : 's') + ')',
            text: emailText,
            html: buildEmailHtml(emailData),
        });

        // Resend returns API rejections in the resolved result instead of always
        // throwing. Do not tell the visitor the registration was submitted unless
        // Resend actually accepted the message for delivery.
        if (sendResult && sendResult.error) {
            console.error('Resend rejected course registration email:', sendResult.error);
            return res.status(502).json({
                success: false,
                error: 'Your registration was validated, but the email could not be delivered. Please try again later or email us directly.',
            });
        }

        if (!sendResult || !sendResult.data || !sendResult.data.id) {
            console.error('Resend returned an unexpected course registration response:', sendResult);
            return res.status(502).json({
                success: false,
                error: 'Your registration was validated, but delivery could not be confirmed. Please try again later or email us directly.',
            });
        }

        return res.status(200).json({ success: true, messageId: sendResult.data.id });
    } catch (err) {
        console.error('Resend send error:', err);
        return res.status(500).json({
            success: false,
            error: 'Unable to submit your registration right now. Please try again later or email us directly.',
        });
    }
};
