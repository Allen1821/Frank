// =====================================================================
// DARPA SOLUTIONS LLC — Renewal Form Upload API (Vercel Serverless)
// Accepts a base64-encoded JPEG/PNG of a completed renewal form,
// validates it, and emails it to Frank via Resend.
//
// SECURITY PROTECTIONS:
//   - POST-only, Content-Type enforcement
//   - IP-based rate limiting (3 per 15 minutes)
//   - Body size guard (rejects payloads > 4.8 MB)
//   - Unknown field rejection
//   - Input trimming + length limits + HTML escaping
//   - Image MIME allowlist (jpeg/png only)
//   - Magic-byte verification (prevents MIME spoofing)
//   - Decoded image size limit (3 MB)
// =====================================================================

const { Resend } = require('resend');

function getResendClient() {
    const apiKey = (process.env.RESEND_API_KEY || '').trim();
    if (!apiKey) return null;
    return new Resend(apiKey);
}

// --- Rate limiter: 3 submissions per 15 minutes per IP ---
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
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

const ALLOWED_FIELDS = new Set(['full_name', 'email', 'phone', 'image_base64', 'image_filename', 'image_mime']);

// Magic bytes for JPEG and PNG
const JPEG_MAGIC = Buffer.from([0xFF, 0xD8, 0xFF]);
const PNG_MAGIC  = Buffer.from([0x89, 0x50, 0x4E, 0x47]);

function isValidImageBuffer(buf, mime) {
    if (mime === 'image/jpeg') return buf.length >= 3 && buf.slice(0, 3).equals(JPEG_MAGIC);
    if (mime === 'image/png')  return buf.length >= 4 && buf.slice(0, 4).equals(PNG_MAGIC);
    return false;
}

function sanitise(value) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/[<>]/g, '').replace(/\s+/g, ' ');
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

function isValidName(name) {
    const letters = name.match(/[a-zA-ZÀ-ɏ]/g);
    return letters && letters.length >= 2;
}

// 3 MB original file -> ~4 MB base64 -> within Vercel's 4.5 MB body limit
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

// =====================================================================
// Email HTML Template
// =====================================================================
function buildEmailHtml(safeFullName, safeEmail, safePhone) {
    return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="680" cellpadding="0" cellspacing="0"
               style="width:680px;max-width:94%;background:#ffffff;border:1px solid #dbe3ee;border-radius:12px;overflow:hidden;">

          <tr>
            <td style="background:#1e40af;color:#ffffff;padding:22px 26px;">
              <div style="font-size:22px;font-weight:700;line-height:1.2;">ASSE 6010 Renewal Form Submission</div>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 26px 16px 26px;">
              <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:12px;">Student Details</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                     style="border-collapse:collapse;border:1px solid #dbe3ee;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="width:140px;background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:10px 12px;font-weight:700;color:#1e293b;">Name</td>
                  <td style="border-bottom:1px solid #e2e8f0;padding:10px 12px;color:#0f172a;">${safeFullName}</td>
                </tr>
                <tr>
                  <td style="width:140px;background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:10px 12px;font-weight:700;color:#1e293b;">Email</td>
                  <td style="border-bottom:1px solid #e2e8f0;padding:10px 12px;color:#0f172a;">${safeEmail}</td>
                </tr>
                <tr>
                  <td style="width:140px;background:#f8fafc;padding:10px 12px;font-weight:700;color:#1e293b;">Phone</td>
                  <td style="padding:10px 12px;color:#0f172a;">${safePhone}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 26px 26px 26px;">
              <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:10px;">Submitted Form Image</div>
              <div style="border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;padding:18px 20px;">
                <div style="font-size:14px;font-weight:700;color:#1e3a8a;">Form image attached to this email</div>
                <div style="font-size:13px;color:#3b5998;margin-top:6px;">Open the attachment to view the completed renewal form submitted by ${safeFullName}.</div>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 26px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748b;">
                Reply to this email to respond directly to ${safeFullName} at ${safeEmail}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// =====================================================================
// Serverless Handler
// =====================================================================
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
    if (rawBody.length > 4.8 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'Request payload too large. Maximum image size is 3 MB.' });
    }

    const body = req.body || {};

    const unknownFields = Object.keys(body).filter(k => !ALLOWED_FIELDS.has(k));
    if (unknownFields.length > 0) {
        return res.status(400).json({ success: false, error: 'Unexpected fields in request.' });
    }

    const full_name    = sanitise(String(body.full_name    || ''));
    const email        = sanitise(String(body.email        || ''));
    const phone        = sanitise(String(body.phone        || ''));
    const image_base64 = typeof body.image_base64 === 'string' ? body.image_base64.trim() : '';
    const image_mime   = sanitise(String(body.image_mime   || ''));

    const errors = [];

    if (!full_name)                  errors.push('Full name is required.');
    else if (full_name.length < 2)   errors.push('Full name must be at least 2 characters.');
    else if (full_name.length > 80)  errors.push('Full name must be 80 characters or fewer.');
    else if (!isValidName(full_name)) errors.push('Full name must contain letters.');

    if (!email)                    errors.push('Email address is required.');
    else if (!isValidEmail(email)) errors.push('Please provide a valid email address.');

    if (phone && !isValidPhone(phone)) errors.push('Please provide a valid phone number.');

    if (!image_base64) errors.push('A form image is required.');

    if (!['image/jpeg', 'image/png'].includes(image_mime)) errors.push('Only JPEG and PNG images are accepted.');

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    let imageBuffer;
    try {
        imageBuffer = Buffer.from(image_base64, 'base64');
    } catch {
        return res.status(400).json({ success: false, error: 'Invalid image data.' });
    }

    if (imageBuffer.length > MAX_IMAGE_BYTES) {
        return res.status(400).json({ success: false, error: 'Image exceeds the 3 MB size limit. Please reduce the file size and try again.' });
    }

    if (!isValidImageBuffer(imageBuffer, image_mime)) {
        return res.status(400).json({ success: false, error: 'File does not appear to be a valid JPEG or PNG image.' });
    }

    const ext          = image_mime === 'image/png' ? '.png' : '.jpg';
    const safeFilename = 'renewal-form-' + full_name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + ext;

    const safeFullName   = escapeHtml(full_name);
    const safeEmail      = escapeHtml(email);
    const safePhone      = escapeHtml(phone || 'N/A');

    const emailHtml = buildEmailHtml(safeFullName, safeEmail, safePhone);

    const emailText = [
        'ASSE 6010 Renewal Form Submission',
        '========================================',
        'Name  : ' + full_name,
        'Email : ' + email,
        'Phone : ' + (phone || 'N/A'),
        '',
        'The completed renewal form image is attached to this email.',
    ].join('\n');

    try {
        await resend.emails.send({
            from:     'DARPA SOLUTIONS LLC <contact@darpasolutionsllc.net>',
            to:       'darpasolutionsllc@gmail.com',
            replyTo: email,
            subject:  '[Renewal Form] ' + full_name + ' — ASSE 6010 Renewal Submission',
            text:     emailText,
            html:     emailHtml,
            attachments: [
                {
                    filename: safeFilename,
                    content:  imageBuffer,
                    contentType: image_mime,
                },
            ],
        });

        return res.status(200).json({ success: true });

    } catch (err) {
        console.error('Resend send error:', err);
        return res.status(500).json({
            success: false,
            error: 'Unable to submit your form right now. Please try again later or email us directly.',
        });
    }
};
