# Renewal Form Photo Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a section below the existing ASSE 6010 renewal form download where students can upload a photo (JPEG or PNG) of their completed renewal form, which sends an email to Frank at `darpasolutionsllc@gmail.com` with the image attached.

**Architecture:** A new Vercel serverless function at `api/renewal-upload.js` receives a JSON POST containing student details and the form image encoded as base64 (handled client-side via FileReader). It validates all inputs, verifies the image file signature (magic bytes), then sends a styled HTML email via Resend with the image as an email attachment. The upload form is added to `students/students.html` directly after `.renewal-forms-section`, styled in `students/students.css`, and handled by a new form handler added inside `initializeFeatures()` in `script.js`.

**Tech Stack:** Resend v4.1.0 (already installed), Vercel serverless Node.js (CommonJS), Vanilla JS FileReader API, base64 image encoding

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `api/renewal-upload.js` | **Create** | Serverless handler: validate inputs, verify image bytes, send email via Resend |
| `students/students.html` | **Modify** | Add upload form section after `.renewal-forms-section` (after line 145) |
| `students/students.css` | **Modify** | Append styles for the upload section before the `@media (max-width: 980px)` block |
| `script.js` | **Modify** | Add upload form JS handler inside `initializeFeatures()` before its closing comment |

---

## Task 1: Create `api/renewal-upload.js`

**Files:**
- Create: `api/renewal-upload.js`

- [ ] **Step 1: Create the file with the full serverless handler**

```js
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
function buildEmailHtml(safeFullName, safeEmail, safePhone, safeSubmittedAt) {
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
              <div style="font-size:13px;opacity:0.9;margin-top:6px;">Submitted (UTC): ${safeSubmittedAt}</div>
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

    const submittedAt    = new Date().toISOString();
    const safeFullName   = escapeHtml(full_name);
    const safeEmail      = escapeHtml(email);
    const safePhone      = escapeHtml(phone || 'N/A');
    const safeSubmittedAt = escapeHtml(submittedAt);

    const emailHtml = buildEmailHtml(safeFullName, safeEmail, safePhone, safeSubmittedAt);

    const emailText = [
        'ASSE 6010 Renewal Form Submission',
        '========================================',
        'Submitted (UTC): ' + submittedAt,
        '',
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
```

- [ ] **Step 2: Verify the file was created**

Run: `dir A:\Frank\Frank\api\`
Expected: both `contact.js` and `renewal-upload.js` listed.

- [ ] **Step 3: Commit**

```
git add api/renewal-upload.js
git commit -m "feat: add renewal form upload serverless function"
```

---

## Task 2: Add the upload section HTML to `students/students.html`

**Files:**
- Modify: `students/students.html` — insert after line 145 (the `</section>` that closes `.renewal-forms-section`)

- [ ] **Step 1: Insert the upload section**

Find this block in `students/students.html` (around line 145):
```html
    </section>

    <!-- ====================================================
         SECTION 4 COMING SOON PORTAL
    ==================================================== -->
```

Replace it with:
```html
    </section>

    <!-- ====================================================
         SECTION 3B UPLOAD RENEWAL FORM
    ==================================================== -->
    <section class="upload-section" id="submit-renewal">
      <div class="container">
        <div class="upload-card">

          <div class="upload-card-header">
            <div class="upload-header-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
            </div>
            <div>
              <h2>Submit Your Completed Form</h2>
              <p>Upload a clear photo or scan of your completed renewal form. We accept JPEG and PNG files up to 3&nbsp;MB.</p>
            </div>
          </div>

          <form id="renewalUploadForm" novalidate>

            <div class="upload-form-row">
              <div class="upload-form-group">
                <label for="renewal-name">Full Name <span aria-label="required">*</span></label>
                <input type="text" id="renewal-name" name="renewal_name" placeholder="John Smith" required maxlength="80" autocomplete="name" />
              </div>
              <div class="upload-form-group">
                <label for="renewal-email">Email Address <span aria-label="required">*</span></label>
                <input type="email" id="renewal-email" name="renewal_email" placeholder="john@example.com" required maxlength="254" autocomplete="email" />
              </div>
              <div class="upload-form-group">
                <label for="renewal-phone">Phone Number <span class="upload-optional">(optional)</span></label>
                <input type="tel" id="renewal-phone" name="renewal_phone" placeholder="(555) 000-0000" maxlength="20" autocomplete="tel" />
              </div>
            </div>

            <div class="upload-drop-zone" id="uploadDropZone" tabindex="0" role="button" aria-label="Select or drag a form image to upload">
              <input type="file" id="renewalFile" accept="image/jpeg,image/png,.jpg,.jpeg,.png" class="upload-file-input" aria-label="Select form image file" />
              <div class="upload-drop-content" id="uploadDropContent">
                <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" fill="none" viewBox="0 0 24 24" stroke="#2563eb" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                <p class="upload-drop-main">Drag and drop your form image here</p>
                <p class="upload-drop-sub">or <span class="upload-browse-link">browse to select a file</span></p>
                <p class="upload-drop-hint">JPEG or PNG &bull; Max 3 MB</p>
              </div>
              <div class="upload-preview" id="uploadPreview" hidden>
                <img id="uploadPreviewImg" src="" alt="Preview of the selected renewal form" />
                <button type="button" class="upload-remove-btn" id="uploadRemoveBtn" aria-label="Remove selected image">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  Remove
                </button>
              </div>
            </div>

            <button type="submit" class="upload-submit-btn" id="uploadSubmitBtn">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
              </svg>
              Submit Renewal Form
            </button>

          </form>
        </div>
      </div>
    </section>

    <!-- ====================================================
         SECTION 4 COMING SOON PORTAL
    ==================================================== -->
```

- [ ] **Step 2: Open the page in a browser and confirm the section renders with no layout breaks.**

- [ ] **Step 3: Commit**

```
git add students/students.html
git commit -m "feat: add renewal form upload section to students page"
```

---

## Task 3: Add CSS to `students/students.css`

**Files:**
- Modify: `students/students.css` — insert the block below immediately before the `/* Responsive */` comment block

- [ ] **Step 1: Insert the upload styles**

Find in `students/students.css`:
```css
/* ------------------------------------------------------------
   Responsive
   ------------------------------------------------------------ */
@media (max-width: 980px) {
```

Insert immediately before it:
```css
/* ------------------------------------------------------------
   Renewal Form Upload Section
   ------------------------------------------------------------ */
.upload-section {
  padding: 0 0 72px;
  background: #f8fafc;
}

.upload-card {
  padding: 34px;
  border: 1px solid #dbe4f0;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.07);
}

.upload-card-header {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  margin-bottom: 28px;
  padding-bottom: 24px;
  border-bottom: 1px solid #e8edf5;
}

.upload-header-icon {
  flex-shrink: 0;
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--primary);
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.upload-card-header h2 {
  margin: 0 0 6px;
  font-size: clamp(26px, 3vw, 36px);
}

.upload-card-header > div > p {
  margin: 0;
  color: #64748b;
  font-size: 15px;
  line-height: 1.68;
}

.upload-form-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 22px;
}

.upload-form-group {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.upload-form-group label {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}

.upload-form-group label span[aria-label="required"] {
  color: #2563eb;
  margin-left: 2px;
}

.upload-optional {
  font-weight: 400;
  color: #94a3b8;
  margin-left: 4px;
}

.upload-form-group input {
  height: 44px;
  padding: 0 14px;
  border: 1px solid #dbe4f0;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  color: #0f172a;
  background: #ffffff;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
  outline: none;
}

.upload-form-group input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.upload-form-group input::placeholder {
  color: #94a3b8;
}

.upload-drop-zone {
  position: relative;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed #bfdbfe;
  border-radius: 10px;
  background: #f8fbff;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
  margin-bottom: 22px;
  outline: none;
}

.upload-drop-zone:hover,
.upload-drop-zone:focus,
.upload-drop-zone.drag-over {
  border-color: #2563eb;
  background: #eff6ff;
}

.upload-file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}

.upload-drop-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
  padding: 24px;
  text-align: center;
}

.upload-drop-main {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.upload-drop-sub {
  margin: 0;
  font-size: 14px;
  color: #64748b;
}

.upload-browse-link {
  color: var(--primary);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.upload-drop-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.upload-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 18px;
  width: 100%;
}

.upload-preview img {
  max-height: 320px;
  max-width: 100%;
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
  display: block;
}

.upload-remove-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid #fecaca;
  border-radius: 6px;
  background: #fff1f2;
  color: #991b1b;
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease;
}

.upload-remove-btn:hover {
  background: #fee2e2;
  border-color: #f87171;
}

.upload-submit-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 28px;
  border: none;
  border-radius: 8px;
  background: var(--primary);
  color: #ffffff;
  font-size: 15px;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.upload-submit-btn:hover:not(:disabled) {
  background: var(--primary-dark);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(30, 64, 175, 0.28);
}

.upload-submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 980px) {
  .upload-form-row {
    grid-template-columns: 1fr 1fr;
  }

  .upload-form-row .upload-form-group:last-child {
    grid-column: span 2;
  }
}

@media (max-width: 600px) {
  .upload-card {
    padding: 22px;
  }

  .upload-card-header {
    flex-direction: column;
  }

  .upload-form-row {
    grid-template-columns: 1fr;
  }

  .upload-form-row .upload-form-group:last-child {
    grid-column: auto;
  }
}

```

- [ ] **Step 2: Open the students page in a browser and verify the upload card looks correct at both desktop and mobile widths.**

- [ ] **Step 3: Commit**

```
git add students/students.css
git commit -m "feat: add upload section styles to students page"
```

---

## Task 4: Add the upload form JS handler to `script.js`

**Files:**
- Modify: `script.js` — add the handler inside `initializeFeatures()`, immediately before `} // End initializeFeatures` (around line 742)

- [ ] **Step 1: Insert the JS handler**

Find in `script.js`:
```js
    } // End initializeFeatures
```

Insert immediately before it:
```js
    // ==========================================
    // Renewal Form Upload Handler
    // ==========================================
    const renewalUploadForm = document.getElementById('renewalUploadForm');

    if (renewalUploadForm) {
        const dropZone    = document.getElementById('uploadDropZone');
        const fileInput   = document.getElementById('renewalFile');
        const dropContent = document.getElementById('uploadDropContent');
        const preview     = document.getElementById('uploadPreview');
        const previewImg  = document.getElementById('uploadPreviewImg');
        const removeBtn   = document.getElementById('uploadRemoveBtn');
        const submitBtn   = document.getElementById('uploadSubmitBtn');
        const MAX_BYTES   = 3 * 1024 * 1024; // 3 MB

        // Keep a reference to the submit button's SVG icon so we can
        // restore it after resetting the button text without using innerHTML.
        const submitBtnIcon = submitBtn.querySelector('svg');

        let selectedFile = null;

        function showPreview(file) {
            selectedFile = file;
            const url = URL.createObjectURL(file);
            previewImg.src = url;
            dropContent.hidden = true;
            preview.hidden = false;
            // Prevent the hidden file input from intercepting click inside the preview
            fileInput.style.pointerEvents = 'none';
        }

        function clearSelection() {
            if (previewImg.src) URL.revokeObjectURL(previewImg.src);
            previewImg.src = '';
            selectedFile = null;
            fileInput.value = '';
            dropContent.hidden = false;
            preview.hidden = true;
            fileInput.style.pointerEvents = '';
        }

        function validateAndShow(file) {
            if (!file) return;
            if (!['image/jpeg', 'image/png'].includes(file.type)) {
                showUploadMessage('Only JPEG and PNG images are accepted.', 'error');
                return;
            }
            if (file.size > MAX_BYTES) {
                showUploadMessage('Image exceeds the 3 MB limit. Please use a smaller file.', 'error');
                return;
            }
            showPreview(file);
        }

        // Drag-and-drop
        dropZone.addEventListener('dragover', function (e) {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', function () {
            dropZone.classList.remove('drag-over');
        });
        dropZone.addEventListener('drop', function (e) {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            var file = e.dataTransfer.files[0];
            if (file) validateAndShow(file);
        });

        // Keyboard accessibility: Enter/Space triggers the file dialog
        dropZone.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        });

        fileInput.addEventListener('change', function () {
            if (this.files[0]) validateAndShow(this.files[0]);
        });

        removeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            clearSelection();
        });

        renewalUploadForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            var nameVal  = (renewalUploadForm.querySelector('[name="renewal_name"]')  || {}).value || '';
            var emailVal = (renewalUploadForm.querySelector('[name="renewal_email"]') || {}).value || '';
            var phoneVal = (renewalUploadForm.querySelector('[name="renewal_phone"]') || {}).value || '';

            if (!nameVal.trim())  { showUploadMessage('Please enter your full name.', 'error'); return; }
            if (!emailVal.trim()) { showUploadMessage('Please enter your email address.', 'error'); return; }
            if (!selectedFile)    { showUploadMessage('Please select a form image to upload.', 'error'); return; }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending…';

            try {
                var base64 = await fileToBase64(selectedFile);

                var payload = {
                    full_name:      nameVal,
                    email:          emailVal,
                    phone:          phoneVal,
                    image_base64:   base64,
                    image_filename: selectedFile.name,
                    image_mime:     selectedFile.type,
                };

                var response = await fetch('/api/renewal-upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                var result = await response.json();

                if (response.ok && result.success) {
                    renewalUploadForm.reset();
                    clearSelection();
                    showUploadMessage('Your renewal form has been submitted successfully. We will be in touch shortly.', 'success');
                } else {
                    var msg = result.errors
                        ? result.errors.join(' ')
                        : result.error || 'Something went wrong. Please try again.';
                    showUploadMessage(msg, 'error');
                }
            } catch (err) {
                showUploadMessage('Network error. Please check your connection and try again.', 'error');
            } finally {
                submitBtn.disabled = false;
                // Restore button label and icon using safe DOM methods (no innerHTML)
                submitBtn.textContent = 'Submit Renewal Form';
                if (submitBtnIcon) submitBtn.prepend(submitBtnIcon);
            }
        });

        function fileToBase64(file) {
            return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onload = function () {
                    // result is "data:image/jpeg;base64,<data>" — strip the data-URL prefix
                    var base64 = reader.result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = function () { reject(new Error('Failed to read file.')); };
                reader.readAsDataURL(file);
            });
        }

        function showUploadMessage(text, type) {
            var prev = renewalUploadForm.querySelector('.upload-status-msg');
            if (prev) prev.remove();

            var msg = document.createElement('div');
            msg.className = 'upload-status-msg';
            msg.textContent = text; // textContent — no XSS risk
            msg.style.padding = '14px 18px';
            msg.style.borderRadius = '8px';
            msg.style.fontSize = '14px';
            msg.style.fontWeight = '600';
            msg.style.marginBottom = '16px';

            if (type === 'success') {
                msg.style.background = '#ecfdf5';
                msg.style.color      = '#065f46';
                msg.style.border     = '1px solid #a7f3d0';
            } else {
                msg.style.background = '#fef2f2';
                msg.style.color      = '#991b1b';
                msg.style.border     = '1px solid #fecaca';
            }

            submitBtn.insertAdjacentElement('beforebegin', msg);
            setTimeout(function () { msg.remove(); }, 10000);
        }
    }
```

- [ ] **Step 2: Open the students page in a browser, open the Console tab, and confirm no JS errors appear on page load.**

- [ ] **Step 3: End-to-end test**
  1. Fill in name and email fields
  2. Select a JPEG or PNG under 3 MB — confirm the image preview appears inside the drop zone
  3. Click "Remove" — confirm the drop zone resets to its empty state
  4. Re-select the file and submit
  5. Confirm the green success message appears
  6. Check `darpasolutionsllc@gmail.com` for an email with subject `[Renewal Form] <name> — ASSE 6010 Renewal Submission` and the image as an attachment

  > **Local testing note:** The API requires `RESEND_API_KEY` in environment. Create `.env` at the project root with `RESEND_API_KEY=re_...` and run `vercel dev` to test locally.

- [ ] **Step 4: Commit**

```
git add script.js
git commit -m "feat: add renewal form upload JS handler with file preview and base64 submit"
```

---

## Self-Review

**Spec coverage:**
- [x] Section appears under renewal forms — Task 2 inserts `#submit-renewal` directly after `.renewal-forms-section`
- [x] Accepts PNG and JPEG only — MIME allowlist enforced client-side (`accept` attribute + JS type check) and server-side (MIME check + magic-byte verification)
- [x] Sends email to Frank — `to: 'darpasolutionsllc@gmail.com'` in Task 1
- [x] Image attached to the email — `attachments` array with decoded buffer in Task 1
- [x] Email template matches site style — blue `#1e40af` header, table layout, consistent with `api/contact.js`
- [x] Frank can reply to the student — `replyTo: email` set in the Resend call
- [x] File size enforced — 3 MB client-side + server-side buffer size guard
- [x] No new npm dependencies — uses `resend` already in `package.json`
- [x] No innerHTML with user data — `msg.textContent` used for user-visible messages; button restore uses `prepend()` on a pre-cloned SVG node

**Placeholder scan:** No TBDs, TODOs, vague "implement later" language, or repeated "similar to Task N" shortcuts.

**Field name consistency across all tasks:**
- `full_name`, `email`, `phone`, `image_base64`, `image_filename`, `image_mime` — identical in `ALLOWED_FIELDS` (Task 1), payload object (Task 4 JS), and API parsing block (Task 1).
- HTML form field `name` attributes (`renewal_name`, `renewal_email`, `renewal_phone`) are query-selected by name in Task 4 JS — consistent.
