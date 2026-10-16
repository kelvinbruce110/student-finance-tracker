const state = {
  records: [],
  settings: sanitizeSettings(null),
  query: '',
  ignoreCase: true,
  sortKey: 'date',
  sortDir: 'desc',
  editingId: null,
  lastAddedId: null
};

function initState() {
  state.records = loadRecords();
  state.settings = loadSettings();
  addMissingCategories(state.records.map(function (r) { return r.category; }));
}

function addMissingCategories(names) {
  let added = false;
  names.forEach(function (name) {
    const known = state.settings.categories.some(function (c) { return c.toLowerCase() === name.toLowerCase(); });
    if (!known) {
      state.settings.categories = state.settings.categories.concat([name]);
      added = true;
    }
  });
  return added;
}

function findCategory(name) {
  const match = state.settings.categories.find(function (c) { return c.toLowerCase() === name.toLowerCase(); });
  return match || name;
}

function nextId() {
  let highest = 0;
  state.records.forEach(function (r) {
    highest = Math.max(highest, Number(r.id.slice(4)) || 0);
  });
  return 'rec_' + String(highest + 1).padStart(4, '0');
}

function addRecord(fields) {
  const check = validateRecordFields(fields);
  if (!check.valid) return { ok: false, errors: check.errors };
  const now = new Date().toISOString();
  const record = {
    id: nextId(),
    description: check.values.description,
    amount: check.values.amount,
    category: findCategory(check.values.category),
    date: check.values.date,
    createdAt: now,
    updatedAt: now
  };
  const newCategory = addMissingCategories([record.category]);
  state.records = state.records.concat([record]);
  state.lastAddedId = record.id;
  const saved = saveRecords(state.records) && (newCategory ? saveSettings(state.settings) : true);
  return { ok: true, record: record, saved: saved };
}

function updateRecord(id, fields) {
  const existing = state.records.find(function (r) { return r.id === id; });
  if (!existing) return { ok: false, errors: { description: 'That record no longer exists.' } };
  const check = validateRecordFields(fields);
  if (!check.valid) return { ok: false, errors: check.errors };
  const record = {
    id: existing.id,
    description: check.values.description,
    amount: check.values.amount,
    category: findCategory(check.values.category),
    date: check.values.date,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  };
  const newCategory = addMissingCategories([record.category]);
  state.records = state.records.map(function (r) { return r.id === id ? record : r; });
  state.editingId = null;
  const saved = saveRecords(state.records) && (newCategory ? saveSettings(state.settings) : true);
  return { ok: true, record: record, saved: saved };
}

function deleteRecord(id) {
  state.records = state.records.filter(function (r) { return r.id !== id; });
  if (state.editingId === id) state.editingId = null;
  return { saved: saveRecords(state.records) };
}

function replaceAll(records, settings) {
  state.records = records;
  if (settings) state.settings = settings;
  addMissingCategories(records.map(function (r) { return r.category; }));
  state.editingId = null;
  return { saved: saveRecords(state.records) && saveSettings(state.settings) };
}

function updateSettings(changes) {
  const merged = Object.assign({}, state.settings, changes);
  merged.rates = Object.assign({}, state.settings.rates, changes.rates || {});
  state.settings = sanitizeSettings(merged);
  return { saved: saveSettings(state.settings) };
}

function addCategory(raw) {
  const check = validateCategory(raw);
  if (!check.valid) return { ok: false, error: check.message };
  const exists = state.settings.categories.some(function (c) { return c.toLowerCase() === check.value.toLowerCase(); });
  if (exists) return { ok: false, error: 'That category already exists.' };
  state.settings.categories = state.settings.categories.concat([check.value]);
  saveSettings(state.settings);
  return { ok: true, name: check.value };
}

function removeCategory(name) {
  const used = state.records.some(function (r) { return r.category.toLowerCase() === name.toLowerCase(); });
  if (used) return { ok: false, error: '"' + name + '" is used by existing records.' };
  state.settings.categories = state.settings.categories.filter(function (c) { return c !== name; });
  saveSettings(state.settings);
  return { ok: true };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toDateString(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
}

function todayString(now) {
  return toDateString(now || new Date());
}

function parseDate(text) {
  const parts = text.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function addDays(text, days) {
  const date = parseDate(text);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

function totalAmount(records) {
  let sum = 0;
  records.forEach(function (r) { sum += r.amount; });
  return round2(sum);
}

function categoryTotals(records) {
  const map = {};
  records.forEach(function (r) {
    if (!map[r.category]) map[r.category] = { category: r.category, total: 0, count: 0 };
    map[r.category].total = round2(map[r.category].total + r.amount);
    map[r.category].count += 1;
  });
  return Object.keys(map).map(function (key) { return map[key]; }).sort(function (a, b) {
    return b.total - a.total || a.category.localeCompare(b.category);
  });
}

function monthTotal(records, yearMonth) {
  return totalAmount(records.filter(function (r) { return r.date.startsWith(yearMonth); }));
}

function lastNDays(records, count, now) {
  const today = todayString(now);
  const days = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const onDay = records.filter(function (r) { return r.date === date; });
    days.push({
      date: date,
      label: parseDate(date).toLocaleDateString('en-US', { weekday: 'short' }),
      total: totalAmount(onDay)
    });
  }
  return days;
}

function capStatus(spent, cap) {
  return {
    spent: spent,
    cap: cap,
    remaining: round2(cap - spent),
    over: spent > cap,
    percent: cap > 0 ? Math.min(100, (spent / cap) * 100) : 0
  };
}

function shiftRecordDates(records, target, windowDays) {
  if (records.length === 0) return records;
  const goal = target || todayString();
  const windowSize = windowDays || 31;
  let newest = records[0].date;
  records.forEach(function (r) { if (r.date > newest) newest = r.date; });
  const diff = Math.round((parseDate(goal) - parseDate(newest)) / 86400000);
  if (diff === 0) return records;
  const cutoff = addDays(newest, -windowSize);
  return records.map(function (r) {
    if (r.date < cutoff) return r;
    return Object.assign({}, r, { date: addDays(r.date, diff) });
  });
}

function convertAmount(amountInBase, currency, rates) {
  if (currency === BASE_CURRENCY) return amountInBase;
  const rate = rates ? rates[currency] : 0;
  return rate > 0 ? round2(amountInBase / rate) : amountInBase;
}

function hasCents(n) {
  return Math.abs(n - Math.round(n)) > 0.000000001;
}

function formatNumber(n) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasCents(n) ? 2 : 0,
    maximumFractionDigits: 2
  }).format(n);
}

function formatMoney(n, currency) {
  const decimals = currency === BASE_CURRENCY ? (hasCents(n) ? 2 : 0) : 2;
  return currency + ' ' + new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2
  }).format(n);
}