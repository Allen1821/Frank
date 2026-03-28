// =====================================================================
// DARPA SOLUTIONS LLC — Contact Form API (Vercel Serverless Function)
// Sends validated form submissions via Resend email service.
//
// SECURITY PROTECTIONS:
//   - POST-only: rejects all other HTTP methods
//   - Content-Type enforcement: requires application/json
//   - IP-based rate limiting (5 submissions per 15 minutes)
//   - Request body size guard (rejects payloads > 10 KB)
//   - Honeypot field — invisible trap that catches bots
//   - Unknown field rejection — only expected keys accepted
//   - Input trimming + length limits on every field
//   - Control character / null byte blocking
//   - Strict email regex validation
//   - Phone format validation (digits, spaces, dashes, parens, plus)
//   - Name format validation — must contain real letters
//   - Subject allowlist — only predefined values accepted
//   - HTML tag stripping — blocks <script>, <iframe>, <a>, etc.
//   - URL/link blocking — rejects http://, https://, www., and bare domains
//   - All user input is escaped before HTML rendering
//   - Security response headers on every response
//   - Proper HTTP status codes: 429, 405, 400, 500
// =====================================================================

const { Resend } = require('resend');

// --- Build Resend client on-demand so missing env vars do not crash the dev server ---
function getResendClient() {
    const apiKey = (process.env.RESEND_API_KEY || '').trim();
    if (!apiKey) return null;
    return new Resend(apiKey);
}

// --- Allowed subject values (allowlist) ---
const VALID_SUBJECTS = ['general', 'services', 'training', 'equipment'];

// --- Allowed field names (reject anything unexpected) ---
const ALLOWED_FIELDS = new Set([
    'full_name', 'organization', 'email', 'phone', 'subject', 'message',
    'website', // honeypot — must always be empty
]);

// =====================================================================
// Rate Limiter (in-memory, per IP, serverless-safe)
// Limits each IP to 5 submissions per 15-minute window.
// =====================================================================
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
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
    if (entry.count > RATE_LIMIT_MAX) return true;
    return false;
}

// Periodically prune stale entries to prevent memory growth
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipHits) {
        if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) ipHits.delete(ip);
    }
}, RATE_LIMIT_WINDOW_MS).unref();

// --- Human-readable subject labels for the email ---
const SUBJECT_LABELS = {
    general: 'General Inquiry',
    services: 'Services',
    training: 'Training Classes',
    equipment: 'Equipment Sales',
};

// =====================================================================
// Validation & Sanitisation Helpers
// =====================================================================

/**
 * Strip all HTML/XML tags from a string.
 * Prevents injection of <script>, <iframe>, <a>, <img>, etc.
 */
function stripHtmlTags(str) {
    return String(str).replace(/[<>]/g, '');
}

/**
 * Detect URLs and link patterns that should not appear in text fields.
 * Blocks http://, https://, www., and bare domains (e.g. allen.com, site.net).
 */
function containsLink(str) {
    // Match http(s)://, www., or bare domains with common TLDs
    return /https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|co|us|info|biz|gov|edu|dev|app|me|tv|cc|xyz|site|online|store|tech|cloud|pro)\b/i.test(str);
}

/**
 * Detect dangerous control characters (null bytes, backspace, escape, etc.).
 * These have no place in contact form text and may indicate injection attempts.
 */
function containsControlChars(str) {
    // ASCII 0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F, 0x7F (allows \t, \n, \r)
    return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(str);
}

/**
 * Validate that a name contains at least some real letters (not just numbers/symbols).
 */
function isValidName(name) {
    // Must contain at least 2 Unicode letters
    const letters = name.match(/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/g);
    return letters && letters.length >= 2;
}

/**
 * Validate an email address with a strict-but-practical regex.
 * Does NOT allow comments, IP literals, or quoted strings.
 */
function isValidEmail(email) {
    // Standard RFC-5321 practical subset
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(email);
}

/**
 * Validate a phone number: allows digits, spaces, dashes, parens, dots,
 * and an optional leading '+'. Must contain at least 7 digits.
 */
function isValidPhone(phone) {
    // Only safe phone characters
    if (!/^[0-9+()\-.\s]+$/.test(phone)) return false;
    // Must have 7–15 actual digits
    const digitCount = (phone.match(/\d/g) || []).length;
    return digitCount >= 7 && digitCount <= 15;
}

/**
 * Sanitise a single text value:
 *  1. Trim whitespace
 *  2. Strip HTML tags
 *  3. Collapse internal whitespace runs to a single space (except newlines in message)
 */
function sanitise(value, preserveNewlines) {
    if (typeof value !== 'string') return '';
    let cleaned = value.trim();
    cleaned = stripHtmlTags(cleaned);
    if (preserveNewlines) {
        // Keep line breaks but collapse spaces/tabs within a line
        cleaned = cleaned.replace(/[^\S\n]+/g, ' ');
    } else {
        cleaned = cleaned.replace(/\s+/g, ' ');
    }
    return cleaned;
}

/**
 * Escape untrusted text so it can be safely inserted into HTML email.
 * This keeps user input as plain text even in an HTML layout.
 */
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =====================================================================
// Serverless Handler
// =====================================================================

module.exports = async function handler(req, res) {

    // --- Security response headers (applied to every response) ---
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // --- Ensure API key exists before proceeding ---
    const resend = getResendClient();
    if (!resend) {
        return res.status(500).json({
            success: false,
            error: 'Server email configuration is missing. Add RESEND_API_KEY and restart the dev server.',
        });
    }

    // --- Method guard: POST only ---
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ success: false, error: 'Method not allowed.' });
    }

    // --- Content-Type guard ---
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('application/json')) {
        return res.status(400).json({ success: false, error: 'Content-Type must be application/json.' });
    }

    // --- Rate limiting by IP ---
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                   || req.socket?.remoteAddress
                   || 'unknown';
    if (isRateLimited(clientIp)) {
        return res.status(429).json({
            success: false,
            error: 'Too many submissions. Please wait a few minutes before trying again.',
        });
    }

    // --- Request body size guard (reject oversized payloads) ---
    const rawBody = JSON.stringify(req.body || {});
    if (rawBody.length > 10240) { // 10 KB max
        return res.status(400).json({ success: false, error: 'Request payload is too large.' });
    }

    // --- Parse & sanitise inputs ---
    const body = req.body || {};

    // --- Reject unknown/unexpected fields ---
    const unknownFields = Object.keys(body).filter(key => !ALLOWED_FIELDS.has(key));
    if (unknownFields.length > 0) {
        return res.status(400).json({ success: false, error: 'Unexpected fields in request.' });
    }

    // --- Honeypot: the "website" field must be empty (bots auto-fill it) ---
    if (body.website) {
        // Silently accept to not tip off bots, but don't actually send
        return res.status(200).json({ success: true });
    }
    const full_name    = sanitise(String(body.full_name    || ''));
    const organization = sanitise(String(body.organization || ''));
    const email        = sanitise(String(body.email        || ''));
    const phone        = sanitise(String(body.phone        || ''));
    const subject      = sanitise(String(body.subject      || ''));
    const message      = sanitise(String(body.message      || ''), true); // preserve newlines

    // --- Collect validation errors ---
    const errors = [];

    // full_name: required, 2–80 chars, must contain real letters
    if (!full_name)                          errors.push('Full name is required.');
    else if (full_name.length < 2)           errors.push('Full name must be at least 2 characters.');
    else if (full_name.length > 80)          errors.push('Full name must be 80 characters or fewer.');
    else if (!isValidName(full_name))        errors.push('Full name must contain letters.');

    // organization: optional, max 120 chars
    if (organization && organization.length > 120) errors.push('Organization must be 120 characters or fewer.');

    // email: required, valid format
    if (!email)                              errors.push('Email address is required.');
    else if (!isValidEmail(email))           errors.push('Please provide a valid email address.');

    // phone: optional, valid format when provided
    if (phone && !isValidPhone(phone))       errors.push('Please provide a valid phone number.');

    // subject: required, must be in allowlist
    if (!subject)                            errors.push('Subject is required.');
    else if (!VALID_SUBJECTS.includes(subject)) errors.push('Invalid subject selection.');

    // message: required, 10–2000 chars
    if (!message)                            errors.push('Message is required.');
    else if (message.length < 10)            errors.push('Message must be at least 10 characters.');
    else if (message.length > 2000)          errors.push('Message must be 2000 characters or fewer.');

    // --- Control character / null byte blocking on all fields ---
    const allTextValues = { full_name, organization, email, phone, message };
    for (const [field, val] of Object.entries(allTextValues)) {
        if (val && containsControlChars(val)) {
            errors.push(`Invalid characters detected in the ${field.replace('_', ' ')} field.`);
        }
    }

    // --- Link / URL blocking on text fields ---
    const textFields = { full_name, organization, email: '', phone: '', message };
    // Note: email and phone are excluded from link checks (email IS a link-like thing,
    // phone is numeric). We check name, org, and message.
    for (const [field, val] of Object.entries(textFields)) {
        if (val && containsLink(val)) {
            errors.push(`Links are not allowed in the ${field.replace('_', ' ')} field.`);
        }
    }

    // --- Return all validation errors at once ---
    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    // --- Build polished plain-text fallback and styled HTML email ---
    const submittedAt = new Date().toISOString();
    const formattedMessage = message
        .split('\n')
        .map(line => `  ${line}`)
        .join('\n');

    const safeFullName = escapeHtml(full_name);
    const safeOrganization = escapeHtml(organization || 'N/A');
    const safeEmail = escapeHtml(email);
    const safePhone = escapeHtml(phone || 'N/A');
    const safeSubject = escapeHtml(SUBJECT_LABELS[subject] || subject);
    const safeSubmittedAt = escapeHtml(submittedAt);
    const safeMessageHtml = escapeHtml(message).replace(/\n/g, '<br />');

    const emailBody = [
        'New Website Contact Submission',
        '========================================',
        `Submitted (UTC): ${submittedAt}`,
        '',
        'Contact Details',
        '----------------------------------------',
        `Name         : ${full_name}`,
        `Organization : ${organization || 'N/A'}`,
        `Email        : ${email}`,
        `Phone        : ${phone || 'N/A'}`,
        `Subject      : ${SUBJECT_LABELS[subject] || subject}`,
        '',
        'Message',
        '----------------------------------------',
        formattedMessage,
        '',
        'End of submission',
    ].join('\n');

        const emailHtml = `
<!doctype html>
<html>
    <body style="margin:0; padding:0; background:#f3f6fb; font-family:Arial, Helvetica, sans-serif; color:#0f172a;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb; padding:24px 0;">
            <tr>
                <td align="center">
                    <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:680px; max-width:94%; background:#ffffff; border:1px solid #dbe3ee; border-radius:12px; overflow:hidden;">
                        <tr>
                            <td style="background:#1e40af; color:#ffffff; padding:22px 26px;">
                                <div style="font-size:22px; font-weight:700; line-height:1.2;">New Website Contact Submission</div>
                                <div style="font-size:13px; opacity:0.9; margin-top:6px;">Submitted (UTC): ${safeSubmittedAt}</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:22px 26px 10px 26px;">
                                <div style="font-size:16px; font-weight:700; color:#0f172a; margin-bottom:12px;">Contact Details</div>
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #dbe3ee; border-radius:8px; overflow:hidden;">
                                    <tr>
                                        <td style="width:170px; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:10px 12px; font-weight:700; color:#1e293b;">Name</td>
                                        <td style="border-bottom:1px solid #e2e8f0; padding:10px 12px; color:#0f172a;">${safeFullName}</td>
                                    </tr>
                                    <tr>
                                        <td style="width:170px; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:10px 12px; font-weight:700; color:#1e293b;">Organization</td>
                                        <td style="border-bottom:1px solid #e2e8f0; padding:10px 12px; color:#0f172a;">${safeOrganization}</td>
                                    </tr>
                                    <tr>
                                        <td style="width:170px; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:10px 12px; font-weight:700; color:#1e293b;">Email</td>
                                        <td style="border-bottom:1px solid #e2e8f0; padding:10px 12px; color:#0f172a;">${safeEmail}</td>
                                    </tr>
                                    <tr>
                                        <td style="width:170px; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:10px 12px; font-weight:700; color:#1e293b;">Phone</td>
                                        <td style="border-bottom:1px solid #e2e8f0; padding:10px 12px; color:#0f172a;">${safePhone}</td>
                                    </tr>
                                    <tr>
                                        <td style="width:170px; background:#f8fafc; padding:10px 12px; font-weight:700; color:#1e293b;">Subject</td>
                                        <td style="padding:10px 12px; color:#0f172a;">${safeSubject}</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:8px 26px 26px 26px;">
                                <div style="font-size:16px; font-weight:700; color:#0f172a; margin-bottom:10px;">Message</div>
                                <div style="border:1px solid #dbe3ee; border-radius:8px; background:#f8fafc; padding:14px 15px; font-size:14px; line-height:1.6; color:#0f172a; white-space:normal; word-break:break-word;">${safeMessageHtml}</div>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>`;

    // --- Send via Resend ---
    try {
        await resend.emails.send({
 
            from: 'DARPA SOLUTIONS LLC <contact@darpasolutionsllc.net>',
            to: 'darpasolutionsllc@gmail.com',//Frank Email
            reply_to: email,   
            subject: `[Website Contact] ${SUBJECT_LABELS[subject] || subject} - ${full_name}`,
            text: emailBody,   // text fallback for clients that block HTML
            html: emailHtml,   // HTML layout with escaped untrusted input
        });

        return res.status(200).json({ success: true });

    } catch (err) {
        // Log server-side for debugging; never expose internal details to the client
        console.error('Resend send error:', err);
        return res.status(500).json({
            success: false,
            error: 'Unable to send your message right now. Please try again later or contact us directly.',
        });
    }
};
