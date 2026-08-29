const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const GOOGLE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const INLINE_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'text/plain',
]);
const GOOGLE_EXPORTS = new Map([
    ['application/vnd.google-apps.document', {
        view: { mimeType: 'application/pdf', extension: '.pdf' },
        download: {
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            extension: '.docx',
        },
    }],
    ['application/vnd.google-apps.spreadsheet', {
        view: { mimeType: 'application/pdf', extension: '.pdf' },
        download: {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            extension: '.xlsx',
        },
    }],
    ['application/vnd.google-apps.presentation', {
        view: { mimeType: 'application/pdf', extension: '.pdf' },
        download: {
            mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            extension: '.pptx',
        },
    }],
    ['application/vnd.google-apps.drawing', {
        view: { mimeType: 'application/pdf', extension: '.pdf' },
        download: { mimeType: 'application/pdf', extension: '.pdf' },
    }],
]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FOLDER_ITEMS = 500;
const MAX_FOLDER_DEPTH = 5;
const MAX_TRAVERSED_FOLDERS = 50;
let cachedToken = null;

function base64Url(value) {
    return Buffer.from(value).toString('base64url');
}

function getGoogleConfig() {
    const clientEmail = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
    const privateKey = String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '')
        .replace(/\\n/g, '\n')
        .trim();
    if (clientEmail && privateKey) return { clientEmail, privateKey };

    const credentialPath = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH || '').trim();
    if (!credentialPath || !path.isAbsolute(credentialPath)) return null;

    try {
        const credential = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
        const fileClientEmail = String(credential.client_email || '').trim();
        const filePrivateKey = String(credential.private_key || '').trim();
        if (credential.type !== 'service_account' || !fileClientEmail || !filePrivateKey) return null;
        return { clientEmail: fileClientEmail, privateKey: filePrivateKey };
    } catch {
        return null;
    }
}

async function getGoogleAccessToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.value;
    const config = getGoogleConfig();
    if (!config) {
        const error = new Error('Google Drive is not configured.');
        error.code = 'DRIVE_NOT_CONFIGURED';
        throw error;
    }

    const now = Math.floor(Date.now() / 1000);
    const encodedHeader = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const encodedClaim = base64Url(JSON.stringify({
        iss: config.clientEmail,
        scope: DRIVE_SCOPE,
        aud: GOOGLE_TOKEN_URL,
        iat: now,
        exp: now + 3600,
    }));
    const unsignedToken = encodedHeader + '.' + encodedClaim;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(unsignedToken), config.privateKey).toString('base64url');
    const assertion = unsignedToken + '.' + signature;

    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }),
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Google Drive authentication failed.');

    const token = await response.json();
    if (!token.access_token) throw new Error('Google Drive authentication returned no token.');
    cachedToken = {
        value: String(token.access_token),
        expiresAt: Date.now() + Math.min(Number(token.expires_in) || 3600, 3600) * 1000,
    };
    return cachedToken.value;
}

function sanitizeDriveName(value) {
    return String(value || 'Student file')
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .replace(/[\\/:*?"<>|]/g, '-')
        .trim()
        .slice(0, 180) || 'Student file';
}

function ensureExtension(name, extension) {
    const safeName = sanitizeDriveName(name);
    return safeName.toLowerCase().endsWith(extension) ? safeName : safeName + extension;
}

function getDriveFileCapabilities(mimeType, size) {
    const exportConfig = GOOGLE_EXPORTS.get(mimeType);
    const validSize = Number(size || 0);
    const withinDownloadLimit = !validSize || validSize <= MAX_FILE_BYTES;
    return {
        previewable: ALLOWED_MIME_TYPES.has(mimeType) && validSize > 0 && validSize <= MAX_IMAGE_BYTES,
        viewable: withinDownloadLimit && (INLINE_MIME_TYPES.has(mimeType) || Boolean(exportConfig)),
        downloadable: withinDownloadLimit && (!mimeType.startsWith('application/vnd.google-apps.') || Boolean(exportConfig)),
    };
}

async function inspectDriveFile(fileId) {
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) {
        const error = new Error('Invalid Drive file identifier.');
        error.code = 'INVALID_DRIVE_FILE';
        throw error;
    }

    const accessToken = await getGoogleAccessToken();
    const baseUrl = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId);
    const metadataResponse = await fetch(
        baseUrl + '?fields=id,name,mimeType,size,trashed,modifiedTime&supportsAllDrives=true',
        {
            headers: { Authorization: 'Bearer ' + accessToken },
            signal: AbortSignal.timeout(10000),
        }
    );
    if (!metadataResponse.ok) {
        const error = new Error('Drive file was not found.');
        error.code = 'DRIVE_FILE_NOT_FOUND';
        throw error;
    }

    const metadata = await metadataResponse.json();
    if (metadata.trashed || metadata.mimeType === GOOGLE_FOLDER_MIME_TYPE) {
        const error = new Error('Drive file was not found.');
        error.code = 'DRIVE_FILE_NOT_FOUND';
        throw error;
    }
    if (Number(metadata.size || 0) > MAX_FILE_BYTES) {
        const error = new Error('Drive file is too large.');
        error.code = 'DRIVE_FILE_TOO_LARGE';
        throw error;
    }
    return {
        id: String(metadata.id || fileId),
        name: String(metadata.name || ''),
        mimeType: metadata.mimeType,
        size: Number(metadata.size || 0),
        modifiedTime: metadata.modifiedTime || null,
    };
}

async function inspectDriveImage(fileId) {
    const metadata = await inspectDriveFile(fileId);
    if (!ALLOWED_MIME_TYPES.has(metadata.mimeType)) {
        const error = new Error('Drive file type is not supported.');
        error.code = 'UNSUPPORTED_DRIVE_FILE';
        throw error;
    }
    if (metadata.size > MAX_IMAGE_BYTES) {
        const error = new Error('Drive file is too large.');
        error.code = 'DRIVE_FILE_TOO_LARGE';
        throw error;
    }
    return metadata;
}

async function inspectDriveFolder(folderId) {
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(folderId)) {
        const error = new Error('Invalid Drive folder identifier.');
        error.code = 'INVALID_DRIVE_FOLDER';
        throw error;
    }

    const accessToken = await getGoogleAccessToken();
    const baseUrl = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(folderId);
    const metadataResponse = await fetch(
        baseUrl + '?fields=id,name,mimeType,trashed&supportsAllDrives=true',
        {
            headers: { Authorization: 'Bearer ' + accessToken },
            signal: AbortSignal.timeout(10000),
        }
    );
    if (!metadataResponse.ok) {
        const error = new Error('Drive folder was not found.');
        error.code = 'DRIVE_FOLDER_NOT_FOUND';
        throw error;
    }

    const metadata = await metadataResponse.json();
    if (metadata.trashed || metadata.mimeType !== GOOGLE_FOLDER_MIME_TYPE) {
        const error = new Error('Drive item is not a folder.');
        error.code = 'NOT_A_DRIVE_FOLDER';
        throw error;
    }
    return {
        id: String(metadata.id || folderId),
        name: String(metadata.name || 'Student Records'),
    };
}

function normalizeDriveItem(file) {
    const id = String(file?.id || '');
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) return null;
    const mimeType = String(file.mimeType || '').slice(0, 160);
    const size = Number(file.size || 0);
    const name = String(file.name || 'Private folder item')
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .trim()
        .slice(0, 255) || 'Private folder item';
    const capabilities = getDriveFileCapabilities(mimeType, size);
    return {
        id,
        name,
        mimeType,
        size: Number.isFinite(size) && size > 0 ? size : 0,
        modifiedTime: file.modifiedTime || null,
        isFolder: mimeType === GOOGLE_FOLDER_MIME_TYPE,
        previewable: capabilities.previewable,
        viewable: capabilities.viewable,
        downloadable: capabilities.downloadable,
    };
}

async function listDriveFolderItems(folderId, accessToken, limit) {
    const items = [];
    let pageToken = '';
    let truncated = false;

    do {
        const query = new URLSearchParams({
            q: "'" + folderId + "' in parents and trashed = false",
            fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)',
            orderBy: 'name_natural',
            pageSize: String(Math.min(Math.max(limit, 1), 1000)),
            spaces: 'drive',
            supportsAllDrives: 'true',
            includeItemsFromAllDrives: 'true',
        });
        if (pageToken) query.set('pageToken', pageToken);

        const response = await fetch('https://www.googleapis.com/drive/v3/files?' + query.toString(), {
            headers: { Authorization: 'Bearer ' + accessToken },
            signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
            const error = new Error('Unable to list Drive folder.');
            error.code = 'DRIVE_FOLDER_LIST_FAILED';
            throw error;
        }

        const payload = await response.json();
        const pageFiles = Array.isArray(payload.files) ? payload.files : [];
        pageFiles.forEach(function (file) {
            const item = normalizeDriveItem(file);
            if (item && items.length < limit) items.push(item);
        });
        const nextPageToken = String(payload.nextPageToken || '');
        if (items.length >= limit && nextPageToken) truncated = true;
        pageToken = items.length < limit ? nextPageToken : '';
    } while (pageToken);

    return { items, truncated };
}

async function listDriveFolderTree(folderId) {
    const folder = await inspectDriveFolder(folderId);
    const accessToken = await getGoogleAccessToken();
    let remainingItems = MAX_FOLDER_ITEMS;
    let traversedFolders = 0;
    let truncated = false;

    async function readChildren(parentId, depth) {
        if (remainingItems < 1) {
            truncated = true;
            return [];
        }

        const result = await listDriveFolderItems(parentId, accessToken, remainingItems);
        if (result.truncated) truncated = true;
        const nodes = [];
        for (const item of result.items) {
            if (remainingItems < 1) {
                truncated = true;
                break;
            }
            remainingItems -= 1;
            const node = {
                id: item.id,
                name: item.name,
                mimeType: item.mimeType,
                size: item.size,
                modifiedTime: item.modifiedTime,
                type: item.isFolder ? 'folder' : 'file',
                previewable: item.previewable,
                viewable: item.viewable,
                downloadable: item.downloadable,
            };
            if (item.isFolder) {
                if (depth < MAX_FOLDER_DEPTH && traversedFolders < MAX_TRAVERSED_FOLDERS) {
                    traversedFolders += 1;
                    node.children = await readChildren(item.id, depth + 1);
                } else {
                    node.children = [];
                    node.truncated = true;
                    truncated = true;
                }
            }
            nodes.push(node);
        }
        return nodes;
    }

    const items = await readChildren(folder.id, 0);
    return {
        folder,
        items,
        itemCount: MAX_FOLDER_ITEMS - remainingItems,
        truncated,
    };
}

function flattenDriveFolderItems(items) {
    const flattened = [];
    (Array.isArray(items) ? items : []).forEach(function (item) {
        flattened.push(item);
        if (item.type === 'folder') flattened.push(...flattenDriveFolderItems(item.children));
    });
    return flattened;
}

async function listDriveFolderImages(folderId) {
    const tree = await listDriveFolderTree(folderId);
    return {
        folder: tree.folder,
        files: flattenDriveFolderItems(tree.items).filter(function (item) { return item.previewable; }),
    };
}

function createFolderDocumentToken(secret, studentId, fileId) {
    return crypto
        .createHmac('sha256', String(secret || ''))
        .update('student-folder-document:v1:' + studentId + ':' + fileId)
        .digest('base64url');
}

async function fetchDriveImage(fileId) {
    const metadata = await inspectDriveImage(fileId);
    const accessToken = await getGoogleAccessToken();
    const baseUrl = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId);

    const mediaResponse = await fetch(baseUrl + '?alt=media&supportsAllDrives=true', {
        headers: { Authorization: 'Bearer ' + accessToken },
        signal: AbortSignal.timeout(15000),
    });
    if (!mediaResponse.ok) throw new Error('Unable to read the Drive file.');

    const data = Buffer.from(await mediaResponse.arrayBuffer());
    if (!data.length || data.length > MAX_IMAGE_BYTES) {
        const error = new Error('Drive file size is invalid.');
        error.code = 'DRIVE_FILE_TOO_LARGE';
        throw error;
    }
    return { data, mimeType: metadata.mimeType };
}

async function fetchDriveFile(fileId, mode) {
    const selectedMode = mode === 'download' ? 'download' : 'view';
    const metadata = await inspectDriveFile(fileId);
    const accessToken = await getGoogleAccessToken();
    const baseUrl = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId);
    const exportConfig = GOOGLE_EXPORTS.get(metadata.mimeType);
    const capabilities = getDriveFileCapabilities(metadata.mimeType, metadata.size);
    let requestUrl;
    let mimeType = metadata.mimeType;
    let filename = sanitizeDriveName(metadata.name);

    if (exportConfig) {
        const format = exportConfig[selectedMode];
        requestUrl = baseUrl + '/export?mimeType=' + encodeURIComponent(format.mimeType);
        mimeType = format.mimeType;
        filename = ensureExtension(metadata.name, format.extension);
    } else {
        if (selectedMode === 'view' && !capabilities.viewable) {
            const error = new Error('Drive file cannot be viewed in a browser.');
            error.code = 'DRIVE_FILE_NOT_VIEWABLE';
            throw error;
        }
        if (!capabilities.downloadable) {
            const error = new Error('Drive file cannot be downloaded.');
            error.code = 'UNSUPPORTED_DRIVE_FILE';
            throw error;
        }
        requestUrl = baseUrl + '?alt=media&supportsAllDrives=true';
    }

    const response = await fetch(requestUrl, {
        headers: { Authorization: 'Bearer ' + accessToken },
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
        const error = new Error('Unable to read the Drive file.');
        error.code = response.status === 404 ? 'DRIVE_FILE_NOT_FOUND' : 'DRIVE_FILE_READ_FAILED';
        throw error;
    }

    const contentLength = Number(response.headers.get('content-length') || metadata.size || 0);
    if (contentLength > MAX_FILE_BYTES) {
        const error = new Error('Drive file size is invalid.');
        error.code = 'DRIVE_FILE_TOO_LARGE';
        throw error;
    }
    if (!response.body) throw new Error('Unable to read the Drive file.');
    return {
        stream: Readable.fromWeb(response.body),
        contentLength: Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0,
        filename,
        mimeType: String(response.headers.get('content-type') || mimeType).split(';')[0],
    };
}

function getGoogleServiceAccountEmail() {
    return getGoogleConfig()?.clientEmail || '';
}

module.exports = {
    createFolderDocumentToken,
    fetchDriveFile,
    fetchDriveImage,
    getGoogleServiceAccountEmail,
    inspectDriveFolder,
    inspectDriveFile,
    inspectDriveImage,
    flattenDriveFolderItems,
    listDriveFolderImages,
    listDriveFolderTree,
    MAX_FILE_BYTES,
};
