const MAX_PATTERN_LENGTH = 200;

function compileRegex(pattern, ignoreCase) {
  if (!pattern) return { regex: null, error: '' };
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { regex: null, error: 'Pattern is too long (max ' + MAX_PATTERN_LENGTH + ' characters).' };
  }
  try {
    return { regex: new RegExp(pattern, ignoreCase === false ? 'g' : 'gi'), error: '' };
  } catch (error) {
    const reason = String(error.message).replace(/^Invalid regular expression:\s*/i, '');
    return { regex: null, error: 'Invalid pattern: ' + reason };
  }
}

function testRegex(regex, text) {
  regex.lastIndex = 0;
  const found = regex.test(text);
  regex.lastIndex = 0;
  return found;
}

function recordMatches(regex, fields) {
  return fields.some(function (field) { return testRegex(regex, field); });
}

function splitMatches(text, regex) {
  if (!regex || !text) return [{ text: text, match: false }];
  const parts = [];
  let last = 0;
  let found;
  regex.lastIndex = 0;
  while ((found = regex.exec(text)) !== null) {
    if (found[0] === '') {
      regex.lastIndex += 1;
      continue;
    }
    if (found.index > last) parts.push({ text: text.slice(last, found.index), match: false });
    parts.push({ text: found[0], match: true });
    last = found.index + found[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  regex.lastIndex = 0;
  return parts.length > 0 ? parts : [{ text: text, match: false }];
}

function highlightInto(node, text, regex) {
  node.textContent = '';
  splitMatches(text, regex).forEach(function (part) {
    if (part.match) {
      const mark = document.createElement('mark');
      mark.textContent = part.text;
      node.append(mark);
    } else {
      node.append(document.createTextNode(part.text));
    }
  });
}

function sortRecords(records, key, dir) {
  const direction = dir === 'asc' ? 1 : -1;
  const compare = {
    date: function (a, b) { return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt); },
    description: function (a, b) { return a.description.localeCompare(b.description, undefined, { sensitivity: 'base' }); },
    amount: function (a, b) { return a.amount - b.amount; }
  }[key];
  return records.slice().sort(function (a, b) {
    return direction * compare(a, b) || a.id.localeCompare(b.id);
  });
}