# Security Best Practices Report

Date: 2026-05-24

## Executive Summary

I reviewed the DARPA SOLUTIONS website as a static JavaScript frontend with Vercel-style Node serverless API handlers. I did not find evidence of exposed secrets, command execution, SQL/database access, unsafe redirects, `eval`, `postMessage` handlers, browser storage of secrets, or direct user-controlled data flowing into `innerHTML`.

The main security concerns are privacy and production hardening: course registration collects sensitive student PII and emails it, rate limiting is in-memory and easy to bypass at scale, site-wide security headers and CSP are not configured in the repo, and uploaded images are only lightly validated before being emailed as attachments.

`npm audit --omit=dev --json` reported 0 vulnerabilities for production dependencies.

## Scope and Stack Evidence

- Frontend: static HTML/CSS/vanilla JavaScript, loaded through `script.js`.
- Backend: Node/Vercel serverless handlers in `api/contact.js`, `api/course-registration.js`, and `api/renewal-upload.js`.
- Email provider: `resend` dependency in `package.json`.
- Deployment config: minimal Vercel config in `vercel.json`.

Positive controls observed:

- `.env.local` is ignored in `.gitignore` lines 32-34.
- API handlers use POST-only checks, content-type checks, request body size checks, unknown-field rejection, input length validation, and HTML escaping for email HTML.
- The renewal upload handler allowlists JPEG/PNG MIME types, enforces a 3 MB decoded size limit, and checks JPEG/PNG magic bytes.

## High Severity

### SBP-001: Sensitive student PII is collected and sent through ordinary email

Rule ID: DATA-MIN-001 / PRIVACY-PII-001

Severity: High

Location:

- `classes/6010.html` lines 263-275
- `classes/6020.html` lines 242-254
- `classes/6040.html` lines 264-276
- `api/course-registration.js` lines 52-61
- `api/course-registration.js` lines 408-426

Evidence:

```js
// api/course-registration.js
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
```

```js
// api/course-registration.js
'   Last four SSN: ' + student.ssn_last4,
'   Address: ' + student.home_address + ', ' + student.city + ', ' + student.state + ' ' + student.zip,
...
await resend.emails.send({
    from: 'DARPA SOLUTIONS LLC <contact@darpasolutionsllc.net>',
    to: 'darpasolutionsllc@gmail.com',
    replyTo: company_email,
    text: emailText,
    html: buildEmailHtml(emailData),
});
```

Impact: If the recipient mailbox, email forwarding path, or email provider account is compromised, student names, last four SSN digits, home addresses, phone numbers, and emails could be exposed.

Fix:

- Remove last-four SSN collection from the public website if it is not strictly required at first contact.
- If it is required, avoid sending it in email. Store the registration in a protected backend or form system and email only a notification/link.
- Limit the email body to non-sensitive summary data, such as company name, contact, course, and student count.
- Add a data retention policy for registration submissions.

Mitigation:

- Use a dedicated business mailbox with MFA and restricted forwarding.
- Use a form provider or backend that supports access control, audit logs, and encrypted storage.
- Document why each sensitive field is required.

False positive notes:

- This may be a business requirement for certification records, but the current transport and storage pattern still creates unnecessary exposure.

## Medium Severity

### SBP-002: Rate limiting is in-memory and depends on forwarded IP headers

Rule ID: EXPRESS-AUTH-001 / EXPRESS-DOS-001

Severity: Medium

Location:

- `api/contact.js` lines 47-60 and 204-208
- `api/course-registration.js` lines 14-26 and 238-241
- `api/renewal-upload.js` lines 25-38 and 183-185

Evidence:

```js
const ipHits = new Map();
...
const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
               || req.socket?.remoteAddress
               || 'unknown';
```

Impact: Attackers can bypass or weaken the limiter by hitting different serverless instances, waiting for cold starts, rotating IPs, or possibly spoofing `x-forwarded-for` if the deployment layer does not overwrite it reliably. These endpoints trigger email sends and image attachment processing, so abuse can cause inbox spam, quota exhaustion, or extra provider cost.

Fix:

- Move rate limiting to Vercel Edge Middleware, Vercel WAF/Firewall, Upstash Redis, Vercel KV, or another shared store.
- Use the platform-provided client IP value where available instead of trusting arbitrary forwarded headers.
- Add abuse controls for public forms, such as Turnstile, reCAPTCHA, or hCaptcha, especially on registration and upload endpoints.

Mitigation:

- Keep the current in-memory limiter as a secondary local guard.
- Monitor Resend send volume and alert on spikes.

False positive notes:

- Vercel usually sets forwarding headers at the edge, but the app code alone does not prove the header is trusted or that rate limit state is shared across instances.

### SBP-003: Site-wide security headers and CSP are not configured in the deployment

Rule ID: JS-CSP-001 / EXPRESS-HEADERS-001

Severity: Medium

Location:

- `vercel.json` lines 1-3
- HTML files: no `Content-Security-Policy` meta tag found
- API-only headers in `api/contact.js` lines 178-181, `api/course-registration.js` lines 218-221, and `api/renewal-upload.js` lines 163-166

Evidence:

```json
{
  "version": 2
}
```

API handlers set several response headers, but static HTML pages are not covered by those handler-level headers. No CSP was visible in the static HTML or Vercel config.

Impact: If an XSS bug is introduced later, the browser has fewer defense-in-depth controls to prevent script execution, clickjacking, or overbroad resource loading. The current site also loads Google Fonts, YouTube iframes, and the YouTube iframe API, so an explicit policy would make the intended trust boundary clearer.

Fix:

- Add Vercel `headers` config for static pages and API routes.
- Start with a reportable, practical CSP that allows the current same-origin scripts/styles plus required Google Fonts and YouTube hosts.
- Move inline scripts in `classes/classes.html` and `equipment/equipment.html` into `script.js` or dedicated same-origin files so CSP can avoid `unsafe-inline`.
- Add `X-Content-Type-Options`, `X-Frame-Options` or CSP `frame-ancestors`, `Referrer-Policy`, and `Permissions-Policy` at the deployment level.

Mitigation:

- If a full CSP is too disruptive immediately, deploy the non-CSP security headers first and add CSP after testing.

False positive notes:

- Headers may be configured in Vercel dashboard or another edge layer outside this repo; verify production responses with a header check.

### SBP-004: Uploaded images are not decoded/re-encoded before being emailed

Rule ID: FILE-UPLOAD-001

Severity: Medium

Location:

- `api/renewal-upload.js` lines 48-57
- `api/renewal-upload.js` lines 230-240
- `api/renewal-upload.js` lines 270-274

Evidence:

```js
function isValidImageBuffer(buf, mime) {
    if (mime === 'image/jpeg') return buf.length >= 3 && buf.slice(0, 3).equals(JPEG_MAGIC);
    if (mime === 'image/png')  return buf.length >= 4 && buf.slice(0, 4).equals(PNG_MAGIC);
    return false;
}
```

```js
attachments: [
    {
        filename: safeFilename,
        content:  imageBuffer,
        contentType: image_mime,
    },
],
```

Impact: Magic-byte checks are useful but do not prove the full file is a safe, well-formed image. A crafted image or polyglot file could still be delivered to the recipient mailbox as an attachment and rely on email client or image parser vulnerabilities.

Fix:

- Decode the uploaded image with a maintained image library, then re-encode it to a fresh JPEG/PNG before attaching.
- Strip metadata during re-encoding.
- Consider malware scanning for attachments if the form remains public.

Mitigation:

- Keep the current MIME allowlist, size limit, and magic-byte checks.
- Avoid storing uploaded files under public web paths. The current code does not store them publicly.

False positive notes:

- The risk is lower because files are not served back from the website, but they are still delivered to a human recipient.

## Low Severity / Hardening

### SBP-005: `innerHTML` is used for trusted templates and constant markup

Rule ID: JS-XSS-001

Severity: Low

Location:

- `script.js` lines 20-33
- `script.js` lines 141-157
- `script.js` line 611
- `script.js` lines 662-668

Evidence:

```js
const navResponse = await fetch(`${pathDepth}navbar-template.html`);
const navHTML = await navResponse.text();
navbarPlaceholder.innerHTML = navHTML;
```

```js
copy.innerHTML = `<h3 id="${group.id}">${group.title}</h3><p>${group.description}</p>`;
```

Impact: I did not find user-controlled data reaching these sinks, so this is not currently an exploitable DOM XSS finding. However, `innerHTML` remains a dangerous sink and can become exploitable if these templates or values later become user-controlled, CMS-managed, or fetched from a less-trusted origin.

Fix:

- Keep user-controlled data out of these paths.
- Prefer `textContent` and DOM construction for dynamic text.
- If template HTML is retained, pair it with a stricter CSP and keep templates same-origin and source-controlled.

Mitigation:

- Add CSP and consider Trusted Types later if the app grows.

False positive notes:

- Current values appear hard-coded or same-origin source-controlled.

### SBP-006: Third-party resources are allowed without a repo-visible policy

Rule ID: JS-SUPPLY-001 / JS-SRI-001

Severity: Low

Location:

- `classes/classes.html` lines 8-13, 23-30, 328-331
- Other HTML pages load Google Fonts from `fonts.googleapis.com` and `fonts.gstatic.com`.

Evidence:

```html
<iframe
  src="https://www.youtube.com/embed/FroTJ4FmUtA?...&enablejsapi=1"
  allow="autoplay; encrypted-media; picture-in-picture; web-share"
></iframe>
```

```js
const tag = document.createElement("script");
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);
```

Impact: Third-party scripts and iframes run code controlled by third parties and expand the browser trust boundary. Without a CSP, the intended set of allowed third-party resources is not documented or enforced by the browser.

Fix:

- Add CSP allowlists for Google Fonts and YouTube resources.
- Self-host fonts if you want to reduce third-party dependency.
- Keep third-party scripts minimal and pinned where possible.

Mitigation:

- Review whether `enablejsapi=1` is required for the YouTube embed. If not needed, remove it.

False positive notes:

- SRI is generally impractical for Google Fonts CSS and the YouTube iframe API because their responses can change. CSP is the better control here.

### SBP-007: Local dev server has no pre-parse request size cap

Rule ID: EXPRESS-DOS-001

Severity: Low

Location:

- `dev-server.js` lines 90-109

Evidence:

```js
const chunks = [];
req.on('data', chunk => chunks.push(chunk));
...
const rawBody = Buffer.concat(chunks).toString('utf8');
```

Impact: If the local dev server were exposed to an untrusted network, a large request body could consume memory before the API handlers apply their own body-size checks.

Fix:

- Add a byte counter in `readJsonBody` and destroy/reject requests above the largest API body limit needed for local testing.
- Keep the dev server bound to localhost only.

Mitigation:

- Treat this as local-only tooling and do not deploy `dev-server.js` as the production server.

False positive notes:

- This is not a production issue if Vercel handles production requests and the dev server is only run locally.

## No Findings Observed

The scan did not find:

- Hard-coded Resend API key or other obvious committed secrets.
- Production dependency vulnerabilities from `npm audit --omit=dev`.
- `eval`, `new Function`, `document.write`, unsafe `postMessage`, `localStorage`/`sessionStorage` secret storage, SQL queries, shell execution, or server-side outbound fetch to user-provided URLs.
- Direct reflection of request data into browser HTML.

## Recommended Fix Order

1. Decide whether last-four SSN and full home address must be collected at registration time. If not, remove or defer those fields.
2. Replace email transport for sensitive registration data with protected storage plus notification email.
3. Add shared, durable rate limiting and bot protection for public form APIs.
4. Add Vercel security headers and a tested CSP.
5. Re-encode uploaded images before emailing attachments.
6. Replace low-risk `innerHTML` usage over time where it is easy to do so.
