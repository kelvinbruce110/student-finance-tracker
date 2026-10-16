const VIEWS = ['dashboard', 'records', 'add', 'settings', 'about'];
const TITLES = {
  dashboard: 'Dashboard',
  records: 'Records',
  add: 'Add expense',
  settings: 'Settings',
  about: 'About'
};
const FORM_CHECKS = {
  description: validateDescription,
  amount: validateAmount,
  category: validateCategory,
  date: validateDate
};
const FIELD_NAMES = ['description', 'amount', 'category', 'date'];
const EDIT_NAMES = ['date', 'description', 'category', 'amount'];
const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

let touched = [];
let focusAfterRender = null;
let editDraft = null;
let lastSettingsKey = '';
let toastTimer = null;
let searchTimer = null;

function $(id) {
  return document.getElementById(id);
}

function $all(selector, root) {
  return Array.from((root || document).querySelectorAll(selector));
}

function make(tag, attrs) {
  const node = document.createElement(tag);
  const options = attrs || {};
  Object.keys(options).forEach(function (key) {
    const value = options[key];
    if (value === false || value == null) return;
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : value);
  });
  for (let i = 2; i < arguments.length; i++) {
    const children = [].concat(arguments[i]);
    children.forEach(function (child) {
      if (child != null && child !== false) node.append(child);
    });
  }
  return node;
}

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

function toDisplay(amount) {
  return convertAmount(amount, state.settings.displayCurrency, state.settings.rates);
}

function money(amount) {
  return formatMoney(toDisplay(amount), state.settings.displayCurrency);
}

function currentMonth() {
  return todayString().slice(0, 7);
}

function searchFields(record) {
  return [record.description, record.category, record.date, formatNumber(record.amount)];
}

function capMessage(status) {
  if (status.over) {
    return 'Monthly cap exceeded: you have spent ' + money(status.spent) + ', which is ' +
      money(-status.remaining) + ' over your ' + money(status.cap) + ' cap.';
  }
  return 'You have spent ' + money(status.spent) + ' of your ' + money(status.cap) +
    ' monthly cap. ' + money(status.remaining) + ' remaining.';
}

function say(message, urgent) {
  const polite = $('toast-polite');
  const alertBox = $('toast-alert');
  const target = urgent ? alertBox : polite;
  polite.textContent = '';
  alertBox.textContent = '';
  polite.classList.remove('show');
  alertBox.classList.remove('show');
  setTimeout(function () {
    target.textContent = message;
    target.classList.add('show');
  }, 30);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    target.classList.remove('show');
    target.textContent = '';
  }, 7000);
}

function afterChange(message, saved) {
  const status = capStatus(monthTotal(state.records, currentMonth()), state.settings.cap);
  let text = message + ' ' + capMessage(status);
  if (!saved) text += ' Warning: your browser blocked saving, so changes will be lost when you close this tab.';
  say(text, status.over || !saved);
}

function confirmBox(title, message, buttonText) {
  const dialog = $('confirm-dialog');
  $('confirm-title').textContent = title;
  $('confirm-message').textContent = message;
  $('confirm-ok').textContent = buttonText;
  return new Promise(function (resolve) {
    dialog.returnValue = '';
    dialog.addEventListener('close', function () {
      resolve(dialog.returnValue === 'ok');
    }, { once: true });
    dialog.showModal();
  });
}

function getHashView() {
  const name = location.hash.replace('#', '');
  return VIEWS.indexOf(name) !== -1 ? name : null;
}

function showView(name, moveFocus) {
  VIEWS.forEach(function (view) {
    $('view-' + view).hidden = view !== name;
  });
  $all('.site-nav a').forEach(function (link) {
    if (link.dataset.view === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = TITLES[name] + ' · PennyWise';
  if (moveFocus) {
    $('h-' + name).focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function goTo(name, focusId) {
  if (getHashView() !== name) history.pushState(null, '', '#' + name);
  showView(name, !focusId);
  if (focusId) $(focusId).focus();
}

function applyTheme() {
  const theme = state.settings.theme;
  document.documentElement.dataset.theme = theme;
  setText($('theme-label'), theme === 'dark' ? 'Light mode' : 'Dark mode');
  setText($('theme-icon'), theme === 'dark' ? '☀' : '☾');
  $('s-theme').value = theme;
}

function toggleTheme() {
  updateSettings({ theme: state.settings.theme === 'dark' ? 'light' : 'dark' });
  renderAll();
}

function drawTrend(days) {
  const box = $('trend');
  box.textContent = '';
  const totals = days.map(function (d) { return d.total; });
  const max = Math.max.apply(null, [0].concat(totals));
  const summary = days.map(function (d) { return d.label + ': ' + money(d.total); }).join('; ');
  box.setAttribute('aria-label', 'Spending over the last 7 days. ' + summary + '.');
  days.forEach(function (day) {
    const height = day.total > 0 ? Math.max((day.total / max) * 100, 4) : 0;
    const shortValue = day.total === 0 ? '0' : compactNumber.format(toDisplay(day.total));
    box.append(
      make('div', { class: 'trend-col' },
        make('span', { class: 'trend-value' }, shortValue),
        make('div', { class: 'trend-track' },
          make('div', { class: 'trend-bar', style: 'height:' + height + '%' })),
        make('span', { class: 'trend-day' }, day.label))
    );
  });
}

function drawCategories(totals) {
  const donut = $('donut');
  const legend = $('legend');
  let grand = 0;
  totals.forEach(function (t) { grand += t.total; });
  if (grand === 0) {
    donut.style.background = '';
    donut.classList.add('is-empty');
    legend.replaceChildren(make('li', { class: 'muted' }, 'No spending recorded yet.'));
    return;
  }
  donut.classList.remove('is-empty');
  let running = 0;
  const stops = totals.map(function (t, i) {
    const start = running;
    running += (t.total / grand) * 100;
    return 'var(--c' + ((i % 9) + 1) + ') ' + start.toFixed(2) + '% ' + running.toFixed(2) + '%';
  });
  donut.style.background = 'conic-gradient(' + stops.join(', ') + ')';
  legend.replaceChildren.apply(legend, totals.map(function (t, i) {
    const percent = (t.total / grand) * 100;
    const color = 'var(--c' + ((i % 9) + 1) + ')';
    return make('li', { class: 'legend-item' },
      make('span', { class: 'legend-swatch', style: 'background:' + color, 'aria-hidden': 'true' }),
      make('span', { class: 'legend-name' }, t.category),
      make('span', { class: 'legend-value' }, money(t.total) + ' · ' + percent.toFixed(0) + '%'),
      make('span', { class: 'legend-bar', 'aria-hidden': 'true' },
        make('span', { style: 'width:' + percent + '%;background:' + color })));
  }));
}

function renderDashboard() {
  const records = state.records;
  const totals = categoryTotals(records);
  const spent = monthTotal(records, currentMonth());
  const status = capStatus(spent, state.settings.cap);
  const days = lastNDays(records, 7);
  const weekTotal = totalAmount(days.map(function (d) { return { amount: d.total }; }));

  setText($('stat-count'), String(records.length));
  setText($('stat-total'), money(totalAmount(records)));
  setText($('stat-top'), totals.length > 0 ? totals[0].category : '–');
  setText($('stat-top-sub'), totals.length > 0 ? money(totals[0].total) : 'No records yet');
  setText($('stat-month'), money(spent));

  const fill = $('meter-fill');
  fill.style.width = status.percent + '%';
  fill.classList.toggle('is-over', status.over);
  fill.classList.toggle('is-near', !status.over && status.percent >= 85);

  const message = capMessage(status);
  setText($('cap-polite'), status.over ? '' : message);
  setText($('cap-assertive'), status.over ? message : '');

  setText($('trend-total'), 'Total: ' + money(weekTotal));
  drawTrend(days);
  drawCategories(totals);
  setText($('donut-total'), compactNumber.format(toDisplay(totalAmount(records))));
  setText($('donut-currency'), state.settings.displayCurrency);
}

function highlighted(text, regex) {
  const span = document.createElement('span');
  highlightInto(span, text, regex);
  return span;
}

function cell(label, content, extraClass) {
  return make('td', { role: 'cell', 'data-label': label, class: extraClass || '' }, content);
}

function buildRow(record, regex) {
  const amountContent = [highlighted(formatNumber(record.amount), regex)];
  if (state.settings.displayCurrency !== BASE_CURRENCY) {
    amountContent.push(make('small', { class: 'muted converted' }, '≈ ' + money(record.amount)));
  }
  return make('tr', { role: 'row', 'data-id': record.id, class: record.id === state.lastAddedId ? 'new-row' : '' },
    cell('Date', highlighted(record.date, regex)),
    cell('Description', highlighted(record.description, regex), 'cell-main'),
    cell('Category', highlighted(record.category, regex)),
    cell('Amount (' + BASE_CURRENCY + ')', amountContent, 'num'),
    cell('Actions', [
      make('button', { type: 'button', class: 'btn small', 'data-action': 'edit', 'aria-label': 'Edit ' + record.description }, 'Edit'),
      make('button', { type: 'button', class: 'btn small danger-outline', 'data-action': 'delete', 'aria-label': 'Delete ' + record.description }, 'Delete')
    ], 'cell-actions'));
}

function editField(name, label, value, extra) {
  const attrs = {
    id: 'e-' + name,
    type: 'text',
    value: value,
    autocomplete: 'off',
    'aria-label': label + ' (editing)',
    'aria-describedby': 'e-' + name + '-err'
  };
  Object.assign(attrs, extra || {});
  return make('div', { class: 'cell-field' },
    make('input', attrs),
    make('p', { class: 'error', id: 'e-' + name + '-err' }));
}

function buildEditRow(record) {
  const draft = editDraft && editDraft.id === record.id ? editDraft : {
    id: record.id,
    date: record.date,
    description: record.description,
    category: record.category,
    amount: String(record.amount)
  };
  return make('tr', { role: 'row', class: 'is-editing', 'data-id': record.id },
    cell('Date', editField('date', 'Date', draft.date, { placeholder: 'YYYY-MM-DD', inputmode: 'numeric' })),
    cell('Description', editField('description', 'Description', draft.description, { maxlength: '80' }), 'cell-main'),
    cell('Category', editField('category', 'Category', draft.category, { list: 'category-options' })),
    cell('Amount (' + BASE_CURRENCY + ')', editField('amount', 'Amount', draft.amount, { inputmode: 'decimal' }), 'num'),
    cell('Actions', [
      make('button', { type: 'button', class: 'btn small primary', 'data-action': 'save' }, 'Save'),
      make('button', { type: 'button', class: 'btn small', 'data-action': 'cancel' }, 'Cancel')
    ], 'cell-actions'));
}

function captureDraft() {
  if (!state.editingId || !$('e-description')) return;
  editDraft = {
    id: state.editingId,
    date: $('e-date').value,
    description: $('e-description').value,
    category: $('e-category').value,
    amount: $('e-amount').value
  };
}

function renderRecords() {
  captureDraft();
  if (!state.editingId) editDraft = null;

  const compiled = compileRegex(state.query, state.ignoreCase);
  const regex = compiled.regex;
  setText($('search-error'), compiled.error);
  $('search-input').setAttribute('aria-invalid', compiled.error ? 'true' : 'false');

  const sorted = sortRecords(state.records, state.sortKey, state.sortDir);
  const visible = regex ? sorted.filter(function (r) {
    return r.id === state.editingId || recordMatches(regex, searchFields(r));
  }) : sorted;

  $('records-body').replaceChildren.apply($('records-body'), visible.map(function (r) {
    return r.id === state.editingId ? buildEditRow(r) : buildRow(r, regex);
  }));

  const total = state.records.length;
  setText($('search-status'), regex ? visible.length + ' of ' + plural(total, 'record') + ' match' : plural(total, 'record'));
  $('empty-state').hidden = total > 0;
  $('no-results').hidden = !(total > 0 && visible.length === 0);
  $('table-wrap').hidden = visible.length === 0;
  $('records-controls').hidden = total === 0;

  $('sort-select').value = state.sortKey + '-' + state.sortDir;
  $all('th[data-sortkey]').forEach(function (th) {
    const active = th.dataset.sortkey === state.sortKey;
    th.setAttribute('aria-sort', active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    setText(th.querySelector('.sort-ind'), active ? (state.sortDir === 'asc' ? '▲' : '▼') : '');
  });

  state.lastAddedId = null;
  if (focusAfterRender) {
    const target = document.querySelector(focusAfterRender);
    if (target) target.focus();
    focusAfterRender = null;
  }
}

function showEditErrors(errors) {
  let first = null;
  EDIT_NAMES.forEach(function (name) {
    const message = errors[name] || '';
    setText($('e-' + name + '-err'), message);
    $('e-' + name).setAttribute('aria-invalid', message ? 'true' : 'false');
    if (message && !first) first = name;
  });
  if (first) $('e-' + first).focus();
  say('Could not save: ' + plural(Object.keys(errors).length, 'field') + ' need fixing.', true);
}

function saveEdit(id) {
  const values = {
    date: $('e-date').value,
    description: $('e-description').value,
    category: $('e-category').value,
    amount: $('e-amount').value
  };
  const result = updateRecord(id, values);
  if (!result.ok) {
    showEditErrors(result.errors);
    return;
  }
  focusAfterRender = 'tr[data-id="' + id + '"] [data-action="edit"]';
  renderAll();
  afterChange('Updated “' + result.record.description + '”.', result.saved);
}

function cancelEdit(id) {
  state.editingId = null;
  focusAfterRender = 'tr[data-id="' + id + '"] [data-action="edit"]';
  renderAll();
}

async function deleteWithConfirm(id, row) {
  const record = state.records.find(function (r) { return r.id === id; });
  if (!record) return;
  const confirmed = await confirmBox(
    'Delete this expense?',
    '“' + record.description + '” (' + money(record.amount) + ' on ' + record.date + ') will be removed. This cannot be undone.',
    'Delete expense'
  );
  if (!confirmed) return;
  const rows = $all('#records-body tr');
  const position = rows.indexOf(row);
  const neighbour = rows[position + 1] || rows[position - 1];
  focusAfterRender = neighbour ? 'tr[data-id="' + neighbour.dataset.id + '"] [data-action="edit"]' : '#h-records';
  const result = deleteRecord(id);
  renderAll();
  afterChange('Deleted “' + record.description + '”.', result.saved);
}

function onTableClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const row = button.closest('tr');
  const id = row.dataset.id;
  const action = button.dataset.action;
  if (action === 'edit') {
    editDraft = null;
    state.editingId = id;
    focusAfterRender = '#e-description';
    renderAll();
  } else if (action === 'cancel') {
    cancelEdit(id);
  } else if (action === 'save') {
    saveEdit(id);
  } else if (action === 'delete') {
    deleteWithConfirm(id, row);
  }
}

function onTableKeydown(event) {
  const input = event.target.closest('.cell-field input');
  if (!input) return;
  const id = input.closest('tr').dataset.id;
  if (event.key === 'Enter') {
    event.preventDefault();
    saveEdit(id);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelEdit(id);
  }
}

function wireRecords() {
  const search = $('search-input');
  search.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.query = search.value;
      renderAll();
    }, 120);
  });
  $('search-ci').addEventListener('change', function (event) {
    state.ignoreCase = event.target.checked;
    renderAll();
  });
  $('sort-select').addEventListener('change', function (event) {
    const parts = event.target.value.split('-');
    state.sortKey = parts[0];
    state.sortDir = parts[1];
    renderAll();
  });
  $all('.sort-btn').forEach(function (button) {
    button.addEventListener('click', function () {
      const key = button.closest('th').dataset.sortkey;
      if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else state.sortDir = key === 'description' ? 'asc' : 'desc';
      state.sortKey = key;
      renderAll();
    });
  });
  $all('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      search.value = chip.dataset.pattern;
      state.query = search.value;
      renderAll();
      search.focus();
    });
  });
  $('records-body').addEventListener('click', onTableClick);
  $('records-body').addEventListener('keydown', onTableKeydown);
  $('load-sample-empty').addEventListener('click', loadSample);
}

function showFieldResult(name, result) {
  setText($('f-' + name + '-error'), result.valid ? '' : result.message);
  $('f-' + name).setAttribute('aria-invalid', result.valid ? 'false' : 'true');
  if (name === 'description') setText($('f-description-warn'), result.valid ? result.warning : '');
  return result.valid;
}

function clearFormState() {
  touched = [];
  FIELD_NAMES.forEach(function (name) {
    setText($('f-' + name + '-error'), '');
    $('f-' + name).setAttribute('aria-invalid', 'false');
  });
  setText($('f-description-warn'), '');
  $('f-date').value = todayString();
}

function wireForm() {
  const form = $('expense-form');
  clearFormState();

  FIELD_NAMES.forEach(function (name) {
    const input = $('f-' + name);
    input.addEventListener('input', function () {
      const result = FORM_CHECKS[name](input.value);
      if (touched.indexOf(name) !== -1) showFieldResult(name, result);
      else if (name === 'description') setText($('f-description-warn'), result.valid ? result.warning : '');
    });
    input.addEventListener('blur', function () {
      if (name === 'description') input.value = collapseSpaces(input.value);
      if (touched.indexOf(name) === -1) touched.push(name);
      showFieldResult(name, FORM_CHECKS[name](input.value));
    });
  });

  $('f-date-today').addEventListener('click', function () {
    $('f-date').value = todayString();
    if (touched.indexOf('date') === -1) touched.push('date');
    showFieldResult('date', validateDate($('f-date').value));
    $('f-date').focus();
  });

  form.addEventListener('reset', function () {
    setTimeout(clearFormState, 0);
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    let firstInvalid = null;
    FIELD_NAMES.forEach(function (name) {
      if (touched.indexOf(name) === -1) touched.push(name);
      const valid = showFieldResult(name, FORM_CHECKS[name]($('f-' + name).value));
      if (!valid && !firstInvalid) firstInvalid = $('f-' + name);
    });
    if (firstInvalid) {
      firstInvalid.focus();
      say('Fix the highlighted fields, then save again.', true);
      return;
    }
    const result = addRecord({
      description: $('f-description').value,
      amount: $('f-amount').value,
      category: $('f-category').value,
      date: $('f-date').value
    });
    if (!result.ok) return;
    form.reset();
    renderAll();
    afterChange('Added “' + result.record.description + '” for ' + money(result.record.amount) + '.', result.saved);
    $('f-description').focus();
  });
}

function renderCategoryList() {
  const counts = {};
  state.records.forEach(function (r) {
    const key = r.category.toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
  });
  $('category-options').replaceChildren.apply($('category-options'), state.settings.categories.map(function (name) {
    return make('option', { value: name });
  }));
  $('category-list').replaceChildren.apply($('category-list'), state.settings.categories.map(function (name) {
    const used = counts[name.toLowerCase()] || 0;
    return make('li', { class: 'cat-item' },
      make('span', { class: 'cat-name' }, name),
      make('span', { class: 'muted' }, used ? 'in use by ' + plural(used, 'record') : 'unused'),
      make('button', {
        type: 'button',
        class: 'btn small',
        'data-remove': name,
        disabled: used > 0,
        'aria-label': 'Remove category ' + name
      }, 'Remove'));
  }));
}

function renderSettings() {
  const s = state.settings;
  const key = JSON.stringify([s.cap, s.displayCurrency, s.rates, s.theme]);
  if (key !== lastSettingsKey) {
    lastSettingsKey = key;
    $('s-cap').value = String(s.cap);
    $('s-currency').value = s.displayCurrency;
    $('s-rate-USD').value = String(s.rates.USD);
    $('s-rate-EUR').value = String(s.rates.EUR);
    ['s-cap', 's-rate-USD', 's-rate-EUR'].forEach(function (id) {
      setText($(id + '-error'), '');
      $(id).setAttribute('aria-invalid', 'false');
    });
  }
  renderCategoryList();
}

function saveSettingsForm(event) {
  event.preventDefault();
  const checks = [
    ['s-cap', validatePositiveNumber($('s-cap').value, 'Cap')],
    ['s-rate-USD', validatePositiveNumber($('s-rate-USD').value, 'USD rate')],
    ['s-rate-EUR', validatePositiveNumber($('s-rate-EUR').value, 'EUR rate')]
  ];
  let firstInvalid = null;
  checks.forEach(function (item) {
    const id = item[0];
    const result = item[1];
    setText($(id + '-error'), result.valid ? '' : result.message);
    $(id).setAttribute('aria-invalid', result.valid ? 'false' : 'true');
    if (!result.valid && !firstInvalid) firstInvalid = $(id);
  });
  if (firstInvalid) {
    firstInvalid.focus();
    say('Settings not saved. Fix the highlighted fields.', true);
    return;
  }
  const result = updateSettings({
    cap: checks[0][1].value,
    displayCurrency: $('s-currency').value,
    rates: { USD: checks[1][1].value, EUR: checks[2][1].value }
  });
  renderAll();
  say(result.saved ? 'Settings saved.' : 'Settings applied, but your browser blocked saving.', !result.saved);
}

function addCategoryFromForm(event) {
  event.preventDefault();
  const input = $('s-new-category');
  const result = addCategory(input.value);
  if (!result.ok) {
    setText($('s-new-category-error'), result.error);
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  setText($('s-new-category-error'), '');
  input.setAttribute('aria-invalid', 'false');
  input.value = '';
  renderAll();
  say('Added category ' + result.name + '.', false);
  input.focus();
}

function removeCategoryFromList(event) {
  const button = event.target.closest('button[data-remove]');
  if (!button) return;
  const name = button.dataset.remove;
  const result = removeCategory(name);
  if (!result.ok) {
    say(result.error, true);
    return;
  }
  renderAll();
  say('Removed category ' + name + '.', false);
  $('s-new-category').focus();
}

async function deleteEverything() {
  const confirmed = await confirmBox(
    'Delete all expenses?',
    'All ' + plural(state.records.length, 'record') + ' will be removed from this browser. Export a backup first if you might need them.',
    'Delete everything'
  );
  if (!confirmed) return;
  replaceAll([], null);
  renderAll();
  say('All expenses deleted.', false);
}

function wireSettings() {
  $('settings-form').addEventListener('submit', saveSettingsForm);
  $('s-theme').addEventListener('change', function (event) {
    updateSettings({ theme: event.target.value });
    renderAll();
  });
  $('category-form').addEventListener('submit', addCategoryFromForm);
  $('category-list').addEventListener('click', removeCategoryFromList);
  $('export-btn').addEventListener('click', exportData);
  $('import-file').addEventListener('change', importData);
  $('load-sample').addEventListener('click', loadSample);
  $('clear-data').addEventListener('click', deleteEverything);
}

function exportData() {
  const text = buildExport(state.records, state.settings);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = make('a', { href: url, download: 'pennywise-export-' + todayString() + '.json' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  say('Exported ' + plural(state.records.length, 'record') + ' to a JSON file.', false);
}

function showImportResult(errors) {
  const box = $('import-result');
  box.replaceChildren();
  if (errors.length === 0) return;
  const shown = errors.slice(0, 5);
  box.append(
    make('p', { class: 'error' }, 'Import failed with ' + plural(errors.length, 'problem') + '. Nothing was changed.'),
    make('ul', { class: 'error-list' }, shown.map(function (message) { return make('li', {}, message); }))
  );
  if (errors.length > shown.length) {
    box.append(make('p', { class: 'muted' }, '…and ' + (errors.length - shown.length) + ' more.'));
  }
}

async function importData(event) {
  const input = event.target;
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  showImportResult([]);
  if (file.size > 5 * 1024 * 1024) {
    showImportResult(['The file is larger than 5 MB.']);
    say('Import failed: the file is too large.', true);
    return;
  }
  const result = parseImport(await file.text());
  if (!result.ok) {
    showImportResult(result.errors);
    say('Import failed: ' + plural(result.errors.length, 'problem') + ' found.', true);
    return;
  }
  let message = 'This replaces your ' + plural(state.records.length, 'current record') +
    ' with ' + plural(result.records.length, 'imported record') + '.';
  if (result.settings) message += ' The settings in the file (cap, rates, categories, theme) are applied too.';
  const confirmed = await confirmBox('Replace your data?', message, 'Import and replace');
  if (!confirmed) return;
  const outcome = replaceAll(result.records, result.settings);
  renderAll();
  afterChange('Imported ' + plural(result.records.length, 'record') + '.', outcome.saved);
}

async function loadSample() {
  let result;
  try {
    result = await fetchSeed();
  } catch (error) {
    say('Could not load seed.json. Open the app through a local server (for example VS Code Live Server), not by double-clicking the file.', true);
    return;
  }
  if (!result.ok) {
    say('seed.json failed validation.', true);
    return;
  }
  if (state.records.length > 0) {
    const confirmed = await confirmBox(
      'Replace your data with sample data?',
      'Your ' + plural(state.records.length, 'current record') + ' will be replaced with ' + result.records.length + ' sample expenses.',
      'Load sample data'
    );
    if (!confirmed) return;
  }
  const outcome = replaceAll(shiftRecordDates(result.records), null);
  renderAll();
  afterChange('Loaded ' + result.records.length + ' sample expenses.', outcome.saved);
}

function onShortcut(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  if (event.target.closest('input, textarea, select')) return;

  const number = Number(event.key);
  if (number >= 1 && number <= VIEWS.length) {
    event.preventDefault();
    goTo(VIEWS[number - 1]);
    return;
  }
  const key = event.key.toLowerCase();
  if (event.key === '?') {
    event.preventDefault();
    $('help-dialog').showModal();
  } else if (key === '/') {
    event.preventDefault();
    goTo('records', 'search-input');
  } else if (key === 'n') {
    event.preventDefault();
    goTo('add', 'f-description');
  } else if (key === 'd') {
    event.preventDefault();
    toggleTheme();
  }
}

function wireDialogsAndShortcuts() {
  $('help-btn').addEventListener('click', function () {
    $('help-dialog').showModal();
  });
  $('theme-toggle').addEventListener('click', toggleTheme);
  $all('dialog').forEach(function (dialog) {
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
  });
  document.addEventListener('keydown', onShortcut);
}

function renderAll() {
  applyTheme();
  renderDashboard();
  renderRecords();
  renderSettings();
}

function initUI() {
  window.addEventListener('hashchange', function () {
    const name = getHashView();
    if (name) showView(name, true);
  });
  wireRecords();
  wireForm();
  wireSettings();
  wireDialogsAndShortcuts();
  renderAll();
  showView(getHashView() || 'dashboard', false);
}