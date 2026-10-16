const STORAGE_KEYS = {
  records: 'pennywise:records',
  settings: 'pennywise:settings'
};

function readStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}

function loadRecords() {
  const data = readStorage(STORAGE_KEYS.records);
  return data === null ? [] : validateImportPayload(data).records;
}

function saveRecords(records) {
  return writeStorage(STORAGE_KEYS.records, records);
}

function loadSettings() {
  return sanitizeSettings(readStorage(STORAGE_KEYS.settings));
}

function saveSettings(settings) {
  return writeStorage(STORAGE_KEYS.settings, settings);
}

function buildExport(records, settings) {
  return JSON.stringify({
    app: 'PennyWise',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: settings,
    records: records
  }, null, 2);
}

function parseImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, records: [], settings: null, errors: ['That file is not valid JSON.'] };
  }
  return validateImportPayload(parsed);
}

async function fetchSeed() {
  const response = await fetch('seed.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return parseImport(await response.text());
}