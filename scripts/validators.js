const BASE_CURRENCY = 'RWF';
const CURRENCIES = ['RWF', 'USD', 'EUR'];
const DEFAULT_CATEGORIES = [
  'Food', 'Books', 'Transport', 'Entertainment', 'Fees',
  'Other', 'Rent', 'Airtime-Data', 'Mobile-Money-Fees'
];
const DEFAULT_SETTINGS = {
  cap: 50000,
  displayCurrency: 'RWF',
  rates: { USD: 1450, EUR: 1700 },
  categories: DEFAULT_CATEGORIES,
  theme: 'dark'
};

const PATTERNS = {
  description: /^\S(?:.*\S)?$/,
  amount: /^(0|[1-9]\d*)(\.\d{1,2})?$/,
  date: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  category: /^[A-Za-z]+(?:[ -][A-Za-z]+)*$/,
  duplicateWord: /\b(\w+)\s+\1\b/i,
  hasLetter: /^(?=.*\p{L})/u,
  recordId: /^rec_\d{4,}$/
};

const MAX_DESCRIPTION = 80;
const MAX_CATEGORY = 30;
const MAX_AMOUNT = 1000000000;

function good(value, warning) {
  return { valid: true, value: value, message: '', warning: warning || '' };
}

function bad(message) {
  return { valid: false, value: null, message: message, warning: '' };
}

function collapseSpaces(text) {
  return String(text == null ? '' : text).replace(/[ \t]{2,}/g, ' ');
}

function validateDescription(raw) {
  const text = String(raw == null ? '' : raw);
  if (text.trim() === '') return bad('Description is required.');
  if (!PATTERNS.description.test(text)) return bad('Remove the spaces at the start or end of the description.');
  if (text.length > MAX_DESCRIPTION) return bad('Keep the description under ' + MAX_DESCRIPTION + ' characters.');
  if (!PATTERNS.hasLetter.test(text)) return bad('Include at least one letter.');
  const cleaned = collapseSpaces(text);
  const repeated = cleaned.match(PATTERNS.duplicateWord);
  const warning = repeated ? 'The word "' + repeated[1] + '" appears twice in a row. Is that a typo?' : '';
  return good(cleaned, warning);
}

function validateAmount(raw) {
  const text = String(raw == null ? '' : raw);
  if (text.trim() === '') return bad('Amount is required.');
  if (!PATTERNS.amount.test(text)) return bad('Use digits only, like 1500 or 1500.50 (max 2 decimals, no commas).');
  const number = Number(text);
  if (number <= 0) return bad('Amount must be greater than 0.');
  if (number > MAX_AMOUNT) return bad('Amount is too large.');
  return good(number);
}

function validatePositiveNumber(raw, label) {
  const result = validateAmount(raw);
  if (!result.valid) result.message = result.message.replace('Amount', label);
  return result;
}

function isRealDate(text) {
  const parts = text.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2];
}

function validateDate(raw) {
  const text = String(raw == null ? '' : raw);
  if (text.trim() === '') return bad('Date is required.');
  if (!PATTERNS.date.test(text)) return bad('Use the format YYYY-MM-DD, like 2026-10-11.');
  if (!isRealDate(text)) return bad('That date does not exist on the calendar.');
  return good(text);
}

function validateCategory(raw) {
  const text = String(raw == null ? '' : raw);
  if (text.trim() === '') return bad('Category is required.');
  if (text.length > MAX_CATEGORY) return bad('Keep the category under ' + MAX_CATEGORY + ' characters.');
  if (!PATTERNS.category.test(text)) return bad('Use letters, spaces and hyphens only, like Mobile-Money-Fees.');
  return good(text);
}

function validateRecordFields(fields) {
  const checks = {
    description: validateDescription(fields.description),
    amount: validateAmount(fields.amount),
    category: validateCategory(fields.category),
    date: validateDate(fields.date)
  };
  const errors = {};
  const values = {};
  Object.keys(checks).forEach(function (name) {
    if (checks[name].valid) values[name] = checks[name].value;
    else errors[name] = checks[name].message;
  });
  return {
    valid: Object.keys(errors).length === 0,
    errors: errors,
    values: values,
    warning: checks.description.warning
  };
}

function validateStoredRecord(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: 'is not an object' };
  if (typeof item.id !== 'string' || !PATTERNS.recordId.test(item.id)) {
    return { error: 'has a missing or malformed id (expected something like "rec_0001")' };
  }
  if (typeof item.amount !== 'number') return { error: '(' + item.id + '): amount must be a number' };
  const textFields = ['description', 'category', 'date'];
  for (let i = 0; i < textFields.length; i++) {
    if (typeof item[textFields[i]] !== 'string') return { error: '(' + item.id + '): ' + textFields[i] + ' must be text' };
  }
  const check = validateRecordFields({
    description: item.description,
    amount: String(item.amount),
    category: item.category,
    date: item.date
  });
  if (!check.valid) {
    const field = Object.keys(check.errors)[0];
    return { error: '(' + item.id + '): ' + field + ' - ' + check.errors[field] };
  }
  const stamps = ['createdAt', 'updatedAt'];
  for (let i = 0; i < stamps.length; i++) {
    if (typeof item[stamps[i]] !== 'string' || isNaN(Date.parse(item[stamps[i]]))) {
      return { error: '(' + item.id + '): ' + stamps[i] + ' must be an ISO date-time string' };
    }
  }
  return {
    record: {
      id: item.id,
      description: check.values.description,
      amount: check.values.amount,
      category: check.values.category,
      date: check.values.date,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }
  };
}

function validateImportPayload(parsed) {
  let list = null;
  let rawSettings = null;
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.records)) {
    list = parsed.records;
    rawSettings = parsed.settings || null;
  } else {
    return { ok: false, records: [], settings: null, errors: ['Expected a list of records, or an object with a "records" list.'] };
  }
  const errors = [];
  const records = [];
  const seen = {};
  list.forEach(function (item, index) {
    const result = validateStoredRecord(item);
    if (result.error) {
      errors.push('Record #' + (index + 1) + ' ' + result.error + '.');
    } else if (seen[result.record.id]) {
      errors.push('Record #' + (index + 1) + ' repeats the id ' + result.record.id + '.');
    } else {
      seen[result.record.id] = true;
      records.push(result.record);
    }
  });
  return {
    ok: errors.length === 0,
    records: records,
    settings: rawSettings ? sanitizeSettings(rawSettings) : null,
    errors: errors
  };
}

function toPositiveNumber(value) {
  const usable = typeof value === 'number' || typeof value === 'string';
  return usable && validateAmount(String(value)).valid ? Number(value) : null;
}

function sanitizeSettings(input) {
  const settings = {
    cap: DEFAULT_SETTINGS.cap,
    displayCurrency: DEFAULT_SETTINGS.displayCurrency,
    theme: DEFAULT_SETTINGS.theme,
    rates: { USD: DEFAULT_SETTINGS.rates.USD, EUR: DEFAULT_SETTINGS.rates.EUR },
    categories: DEFAULT_CATEGORIES.slice()
  };
  if (!input || typeof input !== 'object') return settings;

  const cap = toPositiveNumber(input.cap);
  if (cap !== null) settings.cap = cap;
  if (CURRENCIES.indexOf(input.displayCurrency) !== -1) settings.displayCurrency = input.displayCurrency;
  if (input.theme === 'light' || input.theme === 'dark') settings.theme = input.theme;

  if (input.rates && typeof input.rates === 'object') {
    ['USD', 'EUR'].forEach(function (code) {
      const rate = toPositiveNumber(input.rates[code]);
      if (rate !== null) settings.rates[code] = rate;
    });
  }

  if (Array.isArray(input.categories)) {
    const cleaned = [];
    input.categories.forEach(function (name) {
      if (typeof name !== 'string' || !validateCategory(name).valid) return;
      const exists = cleaned.some(function (c) { return c.toLowerCase() === name.toLowerCase(); });
      if (!exists) cleaned.push(name);
    });
    if (cleaned.length > 0) settings.categories = cleaned;
  }
  return settings;
}