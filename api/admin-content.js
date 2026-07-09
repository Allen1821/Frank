const fs = require('fs');
const path = require('path');
const {
    getGithubConfig,
    isJsonRequest,
    requireAdmin,
    requireCsrf,
    requireSameOrigin,
    sendJson,
    setAdminSecurityHeaders,
} = require('./_admin-utils');

const CONTENT_PATH = 'content/site-content.json';
const MAX_JSON_BYTES = 120 * 1024;
const MAX_PAGES = 25;
const MAX_FIELDS = 300;
const MAX_FIELD_VALUE = 2000;
const FIELD_TYPES = new Set(['text', 'textarea']);
const FORBIDDEN_SELECTOR_TARGETS = /\b(?:script|style|iframe|object|embed|input|textarea|select|head|meta)\b/i;

function hasControlChars(value) {
    return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value);
}

function hasHtmlSyntax(value) {
    return /[<>]|&(?:lt|gt|#60|#62|#x3c|#x3e);/i.test(value);
}

function validateId(value) {
    return /^[a-z0-9][a-z0-9._-]{1,100}$/i.test(value);
}

function validateSelector(value) {
    if (value.length < 2 || value.length > 180) return false;
    if (!/^[#.,:*$^=\[\]\w\s>+~="'()-]+$/.test(value)) return false;
    if (FORBIDDEN_SELECTOR_TARGETS.test(value)) return false;
    return true;
}

function validatePlainText(value, maxLength) {
    if (typeof value !== 'string') return false;
    if (value.length > maxLength) return false;
    if (hasControlChars(value)) return false;
    if (hasHtmlSyntax(value)) return false;
    return true;
}

function validateContent(content) {
    const errors = [];
    const seenIds = new Set();
    let fieldCount = 0;

    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        return ['Content must be an object.'];
    }

    const topKeys = new Set(['version', 'updatedAt', 'pages']);
    Object.keys(content).forEach(key => {
        if (!topKeys.has(key)) errors.push(`Unexpected top-level field: ${key}`);
    });

    if (content.version !== 1) errors.push('Content version must be 1.');
    if (typeof content.updatedAt !== 'string' || content.updatedAt.length > 40) errors.push('updatedAt must be a short string.');
    if (!Array.isArray(content.pages)) errors.push('pages must be an array.');
    if (!Array.isArray(content.pages)) return errors;
    if (content.pages.length < 1 || content.pages.length > MAX_PAGES) errors.push(`pages must contain 1-${MAX_PAGES} items.`);

    content.pages.forEach((page, pageIndex) => {
        if (!page || typeof page !== 'object' || Array.isArray(page)) {
            errors.push(`Page ${pageIndex + 1} must be an object.`);
            return;
        }

        const pageKeys = new Set(['id', 'label', 'description', 'fields']);
        Object.keys(page).forEach(key => {
            if (!pageKeys.has(key)) errors.push(`Unexpected field on page ${pageIndex + 1}: ${key}`);
        });

        if (typeof page.id !== 'string' || !validateId(page.id)) errors.push(`Page ${pageIndex + 1} has an invalid id.`);
        if (!validatePlainText(page.label, 80)) errors.push(`Page ${pageIndex + 1} has an invalid label.`);
        if (page.description !== undefined && !validatePlainText(page.description, 180)) errors.push(`Page ${pageIndex + 1} has an invalid description.`);
        if (!Array.isArray(page.fields)) {
            errors.push(`Page ${pageIndex + 1} fields must be an array.`);
            return;
        }
        if (page.fields.length > 60) errors.push(`Page ${pageIndex + 1} has too many fields.`);

        page.fields.forEach((field, fieldIndex) => {
            fieldCount += 1;
            if (!field || typeof field !== 'object' || Array.isArray(field)) {
                errors.push(`Field ${fieldIndex + 1} on ${page.id || pageIndex + 1} must be an object.`);
                return;
            }

            const fieldKeys = new Set(['id', 'label', 'selector', 'type', 'maxLength', 'value']);
            Object.keys(field).forEach(key => {
                if (!fieldKeys.has(key)) errors.push(`Unexpected property on field ${field.id || fieldIndex + 1}: ${key}`);
            });

            if (typeof field.id !== 'string' || !validateId(field.id)) errors.push(`Field ${fieldIndex + 1} on ${page.id} has an invalid id.`);
            if (seenIds.has(field.id)) errors.push(`Duplicate field id: ${field.id}`);
            seenIds.add(field.id);

            if (!validatePlainText(field.label, 100)) errors.push(`Field ${field.id || fieldIndex + 1} has an invalid label.`);
            if (typeof field.selector !== 'string' || !validateSelector(field.selector)) errors.push(`Field ${field.id || fieldIndex + 1} has an invalid selector.`);
            if (!FIELD_TYPES.has(field.type)) errors.push(`Field ${field.id || fieldIndex + 1} has an invalid type.`);

            const maxLength = Number(field.maxLength);
            if (!Number.isInteger(maxLength) || maxLength < 20 || maxLength > MAX_FIELD_VALUE) {
                errors.push(`Field ${field.id || fieldIndex + 1} has an invalid maxLength.`);
            } else if (!validatePlainText(field.value, maxLength)) {
                errors.push(`Field ${field.id || fieldIndex + 1} contains invalid text or is too long.`);
            }
        });
    });

    if (fieldCount > MAX_FIELDS) errors.push(`Content has too many editable fields. Maximum is ${MAX_FIELDS}.`);
    return errors;
}

function localContentPath() {
    return path.join(process.cwd(), CONTENT_PATH);
}

async function readLocalContent() {
    const raw = await fs.promises.readFile(localContentPath(), 'utf8');
    return JSON.parse(raw);
}

function githubHeaders(token) {
    return {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2026-03-10',
        'User-Agent': 'darpa-solutions-admin',
    };
}

function encodeContentPath(contentPath) {
    return contentPath.split('/').map(encodeURIComponent).join('/');
}

async function readGithubContent(config) {
    const encodedPath = encodeContentPath(config.contentPath);
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}`;
    const response = await fetch(url, { headers: githubHeaders(config.token) });

    if (!response.ok) {
        throw new Error(`GitHub content read failed with status ${response.status}`);
    }

    const payload = await response.json();
    const raw = Buffer.from(String(payload.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
    return { content: JSON.parse(raw), sha: payload.sha };
}

async function saveGithubContent(config, content) {
    const existing = await readGithubContent(config);
    const encodedPath = encodeContentPath(config.contentPath);
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodedPath}`;
    const body = {
        message: 'Update site content from admin',
        content: Buffer.from(JSON.stringify(content, null, 2) + '\n', 'utf8').toString('base64'),
        sha: existing.sha,
        branch: config.branch,
    };

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            ...githubHeaders(config.token),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub content save failed with status ${response.status}: ${errorText.slice(0, 180)}`);
    }

    return response.json();
}

async function triggerDeployHook() {
    const hookUrl = String(process.env.VERCEL_DEPLOY_HOOK_URL || '').trim();
    if (!hookUrl) return false;

    const response = await fetch(hookUrl, { method: 'POST' });
    if (!response.ok) {
        console.error('Vercel deploy hook failed with status:', response.status);
        return false;
    }

    return true;
}

module.exports = async function handler(req, res) {
    setAdminSecurityHeaders(res);

    const user = await requireAdmin(req, res);
    if (!user) return;

    if (req.method === 'GET') {
        try {
            const config = getGithubConfig();
            if (config.ok) {
                const githubContent = await readGithubContent(config);
                return sendJson(res, 200, {
                    success: true,
                    content: githubContent.content,
                    source: { type: 'github', branch: config.branch, path: config.contentPath },
                });
            }

            const content = await readLocalContent();
            return sendJson(res, 200, {
                success: true,
                content,
                source: { type: 'local', branch: null, path: CONTENT_PATH, warning: config.error },
            });
        } catch (err) {
            console.error('Admin content read error:', err);
            return sendJson(res, 500, { success: false, error: 'Unable to load site content.' });
        }
    }

    if (req.method !== 'PUT') {
        res.setHeader('Allow', 'GET, PUT');
        return sendJson(res, 405, { success: false, error: 'Method not allowed.' });
    }

    if (!requireSameOrigin(req, res)) return;
    if (!requireCsrf(req, res)) return;

    if (!isJsonRequest(req)) {
        return sendJson(res, 400, { success: false, error: 'Content-Type must be application/json.' });
    }

    const rawBody = JSON.stringify(req.body || {});
    if (rawBody.length > MAX_JSON_BYTES) {
        return sendJson(res, 400, { success: false, error: 'Content update is too large.' });
    }

    const body = req.body || {};
    const unknownFields = Object.keys(body).filter(key => key !== 'content');
    if (unknownFields.length > 0) {
        return sendJson(res, 400, { success: false, error: 'Unexpected fields in request.' });
    }

    const content = body.content;
    if (content && typeof content === 'object') {
        content.updatedAt = new Date().toISOString();
    }

    const validationErrors = validateContent(content);
    if (validationErrors.length > 0) {
        return sendJson(res, 400, { success: false, errors: validationErrors.slice(0, 12) });
    }

    const config = getGithubConfig();
    if (!config.ok) {
        return sendJson(res, 500, { success: false, error: config.error });
    }

    try {
        const githubResult = await saveGithubContent(config, content);
        const deployTriggered = await triggerDeployHook();

        return sendJson(res, 200, {
            success: true,
            content,
            commit: {
                sha: githubResult.commit?.sha || null,
                htmlUrl: githubResult.commit?.html_url || null,
            },
            deployTriggered,
            source: { type: 'github', branch: config.branch, path: config.contentPath },
        });
    } catch (err) {
        console.error('Admin content save error:', err);
        return sendJson(res, 500, { success: false, error: 'Unable to save content to GitHub.' });
    }
};
