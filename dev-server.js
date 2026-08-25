const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const rootDir = __dirname;
const port = Number(process.env.PORT || 3000);

loadEnvFile(path.join(rootDir, '.env.local'));

const apiHandlers = {
  '/api/contact': require('./api/contact'),
  '/api/renewal-upload': require('./api/renewal-upload'),
  '/api/course-registration': require('./api/course-registration'),
  '/api/admin-auth': require('./api/admin-auth'),
  '/api/admin-session': require('./api/admin-session'),
  '/api/admin-content': require('./api/admin-content'),
  '/api/admin-students': require('./api/admin-students'),
  '/api/admin-student': require('./api/admin-student'),
  '/api/admin-student-document': require('./api/admin-student-document'),
  '/api/admin-student-folder': require('./api/admin-student-folder'),
  '/api/admin-student-notification': require('./api/admin-student-notification'),
  '/api/student-auth': require('./api/student-auth'),
  '/api/student-password-reset': require('./api/student-password-reset'),
  '/api/student-password-recovery': require('./api/student-password-recovery'),
  '/api/student-password-update': require('./api/student-password-update'),
  '/api/student-register': require('./api/student-register'),
  '/api/student-session': require('./api/student-session'),
  '/api/student-account': require('./api/student-account'),
  '/api/student-document': require('./api/student-document'),
};

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (apiHandlers[requestUrl.pathname]) {
      await handleApiRequest(req, res, apiHandlers[requestUrl.pathname], requestUrl);
      return;
    }

    serveStaticFile(requestUrl.pathname, res);
  } catch (err) {
    console.error('Local dev server error:', err);
    sendJson(res, 500, { success: false, error: 'Local server error.' });
  }
});

server.listen(port, () => {
  console.log(`Local site running at http://localhost:${port}`);
  console.log('API routes mounted: public forms, admin, and student portal');
});

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function handleApiRequest(req, res, handler, requestUrl) {
  req.body = await readJsonBody(req);
  req.query = Object.fromEntries(requestUrl.searchParams.entries());

  res.status = function status(code) {
    res.statusCode = code;
    return res;
  };

  res.json = function json(payload) {
    sendJson(res, res.statusCode || 200, payload);
  };

  await handler(req, res);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('error', reject);
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch {
        resolve({});
      }
    });
  });
}

function serveStaticFile(urlPath, res) {
  const normalizedPath = decodeURIComponent(urlPath.split('?')[0]);
  const requestedPath = normalizedPath === '/'
    ? '/index.html'
    : normalizedPath.endsWith('/')
      ? `${normalizedPath}index.html`
      : normalizedPath;
  const absolutePath = path.resolve(rootDir, `.${requestedPath}`);

  const pathSegments = requestedPath.split('/').filter(Boolean);
  const blockedDirectories = new Set(['api', 'node_modules', 'supabase', '.git', '.vercel']);

  if (
    pathSegments.some(segment => segment.startsWith('.'))
    || pathSegments.some(segment => blockedDirectories.has(segment.toLowerCase()))
  ) {
    sendText(res, 404, 'Not found');
    return;
  }

  if (absolutePath !== rootDir && !absolutePath.startsWith(rootDir + path.sep)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  fs.stat(absolutePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      sendText(res, 404, 'Not found');
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(absolutePath).pipe(res);
  });
}

function sendJson(res, statusCode, payload) {
  if (res.writableEnded) return;
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  if (res.writableEnded) return;
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(text);
}
