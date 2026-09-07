// Generates a few harmless user database requests each day so the Supabase
// Free Plan project has regular activity. Run locally with: npm run keepalive

const REQUESTS_PER_RUN = 3;
const ATTEMPTS_PER_REQUEST = 3;
const RETRY_DELAY_MS = 5000;
const REQUEST_GAP_MS = 1000;
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
        throw new Error('SUPABASE_URL must be an HTTPS project URL without a path.');
    }
    if (!/^[A-Za-z0-9_]+$/.test(table)) {
        throw new Error('SUPABASE_KEEPALIVE_TABLE must be a plain table name.');
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
        const error = new Error(
            `Supabase responded with ${response.status} ${response.statusText}. ${detail}`
        );
        error.permanent = [401, 403, 404].includes(response.status);
        throw error;
    }

    return body.slice(0, 200);
}

async function pingWithRetry(config, requestNumber) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_REQUEST; attempt += 1) {
        try {
            const body = await ping(config);
            console.log(
                `Keepalive request ${requestNumber}/${REQUESTS_PER_RUN} succeeded `
                + `on attempt ${attempt}. Response: ${body}`
            );
            return;
        } catch (error) {
            const lastAttempt = attempt === ATTEMPTS_PER_REQUEST;
            console.error(
                `Keepalive request ${requestNumber}, attempt ${attempt} failed: ${error.message}`
            );

            if (error.permanent || lastAttempt) throw error;
            await wait(RETRY_DELAY_MS * attempt);
        }
    }
}

async function main() {
    const config = readConfig();
    console.log(`Pinging ${config.url}/rest/v1/${config.table}`);

    for (let requestNumber = 1; requestNumber <= REQUESTS_PER_RUN; requestNumber += 1) {
        await pingWithRetry(config, requestNumber);
        if (requestNumber < REQUESTS_PER_RUN) await wait(REQUEST_GAP_MS);
    }

    console.log('Supabase keepalive completed successfully.');
}

main().catch(error => {
    console.error(`Supabase keepalive failed: ${error.message}`);
    process.exitCode = 1;
});
