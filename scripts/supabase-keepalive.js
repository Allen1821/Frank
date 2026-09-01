// Reads one row through the Supabase REST API so a free plan project
// never reaches the inactivity window that pauses the database.
// Run locally with: npm run keepalive

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;
const REQUEST_TIMEOUT_MS = 20000;

function readConfig() {
    const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const apiKey = String(
        process.env.SUPABASE_PUBLISHABLE_KEY
        || process.env.SUPABASE_ANON_KEY
        || ''
    ).trim();
    const table = String(process.env.SUPABASE_KEEPALIVE_TABLE || 'keepalive').trim();

    const missing = [];
    if (!url) missing.push('SUPABASE_URL');
    if (!apiKey) missing.push('SUPABASE_PUBLISHABLE_KEY');
    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    if (!/^https:\/\/[^/]+$/.test(url)) {
        throw new Error(`SUPABASE_URL must look like https://your-project-ref.supabase.co (received "${url}")`);
    }
    if (!/^[A-Za-z0-9_]+$/.test(table)) {
        throw new Error(`SUPABASE_KEEPALIVE_TABLE must be a plain table name (received "${table}")`);
    }

    return { url, apiKey, table };
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function ping(config) {
    const endpoint = `${config.url}/rest/v1/${config.table}?select=id&limit=1`;
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            apikey: config.apiKey,
            Authorization: `Bearer ${config.apiKey}`,
            Accept: 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const body = await response.text();
    if (!response.ok) {
        const detail = body.slice(0, 300).replace(/\s+/g, ' ').trim();
        const error = new Error(`Supabase responded with ${response.status} ${response.statusText}. ${detail}`);
        // A missing table or a rejected key will not fix itself on a retry.
        error.permanent = response.status === 404 || response.status === 401 || response.status === 403;
        throw error;
    }

    return body.slice(0, 200);
}

async function main() {
    const config = readConfig();
    console.log(`Pinging ${config.url}/rest/v1/${config.table}`);

    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        try {
            const body = await ping(config);
            console.log(`Supabase keepalive succeeded on attempt ${attempt}. Response: ${body}`);
            return;
        } catch (error) {
            const lastAttempt = attempt === ATTEMPTS;
            console.error(`Attempt ${attempt} failed: ${error.message}`);

            if (error.permanent) {
                console.error('This looks like a configuration problem, so no retry will help.');
                console.error('Confirm the keepalive migration ran and that the repository secrets match the project.');
                throw error;
            }
            if (lastAttempt) throw error;

            await wait(RETRY_DELAY_MS * attempt);
        }
    }
}

main().catch(error => {
    console.error(`Supabase keepalive failed: ${error.message}`);
    process.exitCode = 1;
});
