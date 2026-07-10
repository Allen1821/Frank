const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const ignoredDirs = new Set(['.git', '.vercel', 'node_modules', 'output']);
const allowedCourseCodes = new Set([
  '6010',
  '6020',
  '6040',
  'recertification-6010',
  'recertification-6020',
  'recertification-6040',
]);

const requiredDateHooks = [
  ['classes/6010.html', 'data-date-group="class-6010"'],
  ['classes/6020.html', 'data-date-group="class-6020"'],
  ['classes/6040.html', 'data-date-group="class-6040"'],
  ['students/students.html', 'data-date-group="recertification"'],
  ['students/students.html', 'data-date-summary="recertification"'],
];

const errors = [];

function fail(message) {
  errors.push(message);
}

function walkFiles(dir, matches) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(entry => {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) walkFiles(path.join(dir, entry.name), matches);
      return;
    }

    if (entry.isFile()) matches.push(path.join(dir, entry.name));
  });
}

function relative(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function readText(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

function hasControlChars(value) {
  return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value);
}

function hasHtmlSyntax(value) {
  return /[<>]|&(?:lt|gt|#60|#62|#x3c|#x3e);/i.test(value);
}

function isPlainText(value, maxLength) {
  return typeof value === 'string'
    && value.length <= maxLength
    && !hasControlChars(value)
    && !hasHtmlSyntax(value);
}

function isId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{1,100}$/i.test(value);
}

function checkJavaScriptSyntax() {
  const files = [];
  walkFiles(rootDir, files);

  files
    .filter(file => file.endsWith('.js'))
    .forEach(file => {
      const result = spawnSync(process.execPath, ['--check', file], {
        cwd: rootDir,
        encoding: 'utf8',
      });

      if (result.status !== 0) {
        fail(`JavaScript syntax failed in ${relative(file)}\n${result.stderr || result.stdout}`);
      }
    });
}

function checkContentJson() {
  let content;
  try {
    content = JSON.parse(readText('content/site-content.json'));
  } catch (err) {
    fail(`content/site-content.json is not valid JSON: ${err.message}`);
    return;
  }

  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    fail('content/site-content.json must contain an object.');
    return;
  }

  if (content.version !== 1) fail('content.version must be 1.');
  if (!Array.isArray(content.pages) || content.pages.length < 1) fail('content.pages must be a non-empty array.');
  if (!Array.isArray(content.dateGroups)) fail('content.dateGroups must be an array.');

  const fieldIds = new Set();
  (content.pages || []).forEach((page, pageIndex) => {
    const pageLabel = page && page.id ? page.id : `page ${pageIndex + 1}`;
    if (!page || typeof page !== 'object' || Array.isArray(page)) {
      fail(`${pageLabel} must be an object.`);
      return;
    }

    if (!isId(page.id)) fail(`${pageLabel} has an invalid id.`);
    if (!isPlainText(page.label, 80)) fail(`${pageLabel} has an invalid label.`);
    if (page.description !== undefined && !isPlainText(page.description, 180)) {
      fail(`${pageLabel} has an invalid description.`);
    }
    if (!Array.isArray(page.fields)) {
      fail(`${pageLabel}.fields must be an array.`);
      return;
    }

    page.fields.forEach((field, fieldIndex) => {
      const fieldLabel = field && field.id ? field.id : `${pageLabel} field ${fieldIndex + 1}`;
      if (!field || typeof field !== 'object' || Array.isArray(field)) {
        fail(`${fieldLabel} must be an object.`);
        return;
      }

      if (!isId(field.id)) fail(`${fieldLabel} has an invalid id.`);
      if (fieldIds.has(field.id)) fail(`Duplicate editable field id: ${field.id}`);
      fieldIds.add(field.id);
      if (!isPlainText(field.label, 100)) fail(`${fieldLabel} has an invalid label.`);
      if (!['text', 'textarea'].includes(field.type)) fail(`${fieldLabel} has an invalid type.`);
      if (!Number.isInteger(field.maxLength) || field.maxLength < 20 || field.maxLength > 2000) {
        fail(`${fieldLabel} has an invalid maxLength.`);
      } else if (!isPlainText(field.value, field.maxLength)) {
        fail(`${fieldLabel} has invalid editable text.`);
      }
    });
  });

  const groupIds = new Set();
  (content.dateGroups || []).forEach((group, groupIndex) => {
    const groupLabel = group && group.id ? group.id : `date group ${groupIndex + 1}`;
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      fail(`${groupLabel} must be an object.`);
      return;
    }

    if (!isId(group.id)) fail(`${groupLabel} has an invalid id.`);
    if (groupIds.has(group.id)) fail(`Duplicate date group id: ${group.id}`);
    groupIds.add(group.id);

    if (!isPlainText(group.category, 60)) fail(`${groupLabel} has an invalid category.`);
    if (!isPlainText(group.label, 100)) fail(`${groupLabel} has an invalid label.`);
    if (group.description !== undefined && !isPlainText(group.description, 180)) {
      fail(`${groupLabel} has an invalid description.`);
    }

    if (!Array.isArray(group.courseCodes) || group.courseCodes.length < 1) {
      fail(`${groupLabel}.courseCodes must be a non-empty array.`);
    } else {
      group.courseCodes.forEach(code => {
        if (!allowedCourseCodes.has(code)) fail(`${groupLabel} uses unknown course code: ${code}`);
      });
    }

    if (!Array.isArray(group.dates)) {
      fail(`${groupLabel}.dates must be an array.`);
      return;
    }

    const dateIds = new Set();
    group.dates.forEach((date, dateIndex) => {
      const dateLabel = date && date.id ? date.id : `${groupLabel} date ${dateIndex + 1}`;
      if (!date || typeof date !== 'object' || Array.isArray(date)) {
        fail(`${dateLabel} must be an object.`);
        return;
      }

      if (!isId(date.id)) fail(`${dateLabel} has an invalid id.`);
      if (dateIds.has(date.id)) fail(`Duplicate date id ${date.id} in ${groupLabel}.`);
      dateIds.add(date.id);
      if (!isPlainText(date.label, 120)) fail(`${dateLabel} has an invalid label.`);
      if (date.note !== undefined && !isPlainText(date.note, 120)) fail(`${dateLabel} has an invalid note.`);
    });
  });
}

function checkDateHooks() {
  requiredDateHooks.forEach(([filePath, expected]) => {
    const contents = readText(filePath);
    if (!contents.includes(expected)) fail(`${filePath} is missing ${expected}.`);
  });
}

function checkAssetReferences() {
  const files = [];
  walkFiles(rootDir, files);
  const relativeFiles = files.map(relative);
  const fileSet = new Set(relativeFiles);
  const textFiles = files.filter(file => /\.(html|css|js|json)$/i.test(file));
  const assetReference = /(?:src|href)=["']((?:\.\.\/)?assets\/[^"']+\.(?:png|jpe?g|svg|webp|pdf))["']/gi;

  textFiles.forEach(file => {
    const text = fs.readFileSync(file, 'utf8');
    const source = relative(file);

    for (const match of text.matchAll(assetReference)) {
      const rawRef = match[1];
      let decodedRef = rawRef;

      try {
        decodedRef = decodeURI(rawRef);
      } catch {
        fail(`${source} has an invalid encoded asset reference: ${rawRef}`);
        continue;
      }

      const normalizedRef = decodedRef.replace(/^\.\.\//, '');
      if (!fileSet.has(normalizedRef)) {
        fail(`${source} references missing asset: ${rawRef}`);
      }
    }
  });
}

checkJavaScriptSyntax();
checkContentJson();
checkDateHooks();
checkAssetReferences();

if (errors.length) {
  console.error('\nSite checks failed:');
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log('Site checks passed.');
