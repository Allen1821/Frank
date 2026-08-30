const assert = require('assert/strict');
const { getSafeContentLength } = require('../server/api/_google-drive');

function responseWithLength(value) {
    return {
        headers: {
            get(name) {
                return name === 'content-length' ? value : null;
            },
        },
    };
}

assert.equal(
    getSafeContentLength(responseWithLength(null), { size: 1024 }, true),
    0,
    'Google Workspace exports must not reuse the native Drive metadata size'
);
assert.equal(
    getSafeContentLength(responseWithLength('4096'), { size: 1024 }, true),
    0,
    'Google Workspace exports should stream without a forwarded length'
);
assert.equal(
    getSafeContentLength(responseWithLength('4096'), { size: 1024 }, false),
    4096,
    'ordinary Drive files should prefer the upstream response length'
);
assert.equal(
    getSafeContentLength(responseWithLength(null), { size: 2048 }, false),
    2048,
    'ordinary Drive files may safely use their metadata size'
);

console.log('Drive download checks passed.');
