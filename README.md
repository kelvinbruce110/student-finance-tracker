# PennyWise: Student Finance Tracker

A simple, private expense tracker for students, built with plain HTML, CSS and JavaScript (no frameworks). Log what you spend, search your history with regular expressions, and stay under a monthly cap. Everything runs in your browser and your data never leaves your device.

**Theme chosen:** Student Finance Tracker (Summative Assignment: Building Responsive UI)

| | |
|---|---|
| **Live site (GitHub Pages)** | https://kelvinbruce110.github.io/student-finance-tracker/ |
| **Repository** | https://github.com/kelvinbruce110/student-finance-tracker |
| **Demo video (2-3 min, unlisted)** | https://youtu.be/Qwid05mC7Vg?si=EssJ_gLjXabFG37n |
| **Tests** | https://kelvinbruce110.github.io/student-finance-tracker/tests.html |

---

## Features

- **Five sections:** Dashboard, Records, Add expense, Settings and About (purpose and contact details).
- **Add, edit and delete** expenses. Editing happens inline in the table row, and deleting asks for confirmation in a dialog.
- **Data model:** every record has a unique `id` (`rec_0001`, `rec_0002`, ...) plus `createdAt` and `updatedAt` timestamps. `updatedAt` changes on every edit.
- **Auto-save** to `localStorage` after every change.
- **Live regex search** across description, category, date and amount, with an "Ignore case" toggle and matches highlighted with `<mark>`. An invalid pattern never crashes the page. It shows a clear message instead.
- **Sorting** by date, description (A to Z or Z to A) and amount (low to high or high to low), from the "Sort by" menu or the column headers.
- **Dashboard:** total records, total spent, top category, this month's spending, a last-7-days bar chart and a spending-by-category donut chart. Each chart has a text alternative.
- **Monthly cap:** set a cap in Settings. A progress meter and a message show what is left. The message is announced politely while you are under the cap and assertively once you go over.
- **Currency:** amounts are stored in RWF (base currency). Settings has manual exchange rates for USD and EUR (no API), and totals can be shown in any of the three.
- **Categories:** default list is editable. Add new categories in Settings, and categories in use cannot be removed.
- **JSON import and export** with full validation. Nothing is loaded unless every record passes.
- **Sample data:** one button loads `seed.json` (24 records with tricky edge cases).
- **Light and dark theme**, saved between visits.
- **Keyboard shortcuts** and a built-in help dialog (press `?`).
- **Responsive:** cards on phones, a full table from 768px.

---

## Data model

```json
{
  "id": "rec_0001",
  "description": "Lunch at cafeteria",
  "amount": 2500,
  "category": "Food",
  "date": "2026-10-09",
  "createdAt": "2026-10-09T12:41:08.000Z",
  "updatedAt": "2026-10-09T12:41:08.000Z"
}
```

- `localStorage` keys: `pennywise:records` and `pennywise:settings`.
- Limits: description up to 80 characters, category up to 30 characters, amount above 0 and up to 1,000,000,000.

### Import and export format

Export downloads a JSON file shaped like this:

```json
{
  "app": "PennyWise",
  "version": 1,
  "exportedAt": "2026-10-14T00:00:00.000Z",
  "settings": { "cap": 50000, "displayCurrency": "RWF", "rates": { "USD": 1450, "EUR": 1700 }, "categories": ["Food"], "theme": "dark" },
  "records": [ ]
}
```

Import accepts that format or a plain array of records (like `seed.json`). Before anything is loaded the file is checked for valid JSON, correct structure, valid ids, amounts, dates, categories, ISO timestamps and duplicate ids. If any record is bad, nothing changes and the first few problems are listed on screen.

---

## Regex catalog

### Validation rules

| Where | Pattern | What it does | Passes | Fails |
|---|---|---|---|---|
| Description | `/^\S(?:.*\S)?$/` | No spaces at the start or end | `Lunch` | ` Lunch`, `Lunch ` |
| Amount | `/^(0\|[1-9]\d*)(\.\d{1,2})?$/` | Whole number or up to 2 decimals, no leading zeros | `12.50`, `1500` | `012`, `12.345`, `1,500` |
| Date | `/^\d{4}-(0[1-9]\|1[0-2])-(0[1-9]\|[12]\d\|3[01])$/` | YYYY-MM-DD shape. A second check rejects days that do not exist | `2024-02-29` | `2026-13-01`, `2026-02-30` |
| Category | `/^[A-Za-z]+(?:[ -][A-Za-z]+)*$/` | Letters, with single spaces or hyphens between words | `Self-care`, `Eating out` | `Food2`, `Food--Data` |
| **Advanced: back-reference** | `/\b(\w+)\s+\1\b/i` | Warns about a repeated word in a description | `Samosa samosa and tea` shows a warning | `Lunch at cafeteria` |
| **Advanced: lookahead** | `/^(?=.*\p{L})/u` | Description must contain at least one letter | `Bus 12` | `12345` |

Extra notes:

- Double spaces inside a description are collapsed to one space when the field loses focus or is saved.
- Record ids must match `/^rec_\d{4,}$/` when importing.
- Cap and exchange-rate fields reuse the amount rule (a positive number, up to 2 decimals).

### Search patterns to try

Search matches against description, category, date and the amount as displayed (for example `2,200.50`). The four chips on the Records page fill these in for you.

| Pattern | Finds |
|---|---|
| `\.\d{2}\b` | Amounts with cents |
| `(coffee\|tea)` | Drinks |
| `\b(\w+)\s+\1\b` | Repeated words, such as "Coffee coffee" |
| `^moto` | Descriptions that start with "moto" |
| `2026-10` | Everything dated in October 2026 |

A broken pattern such as `(` shows an "Invalid pattern" message, and all records stay visible. Patterns are limited to 200 characters, and the search box compiles them inside a `try/catch`.

---

## Keyboard map

The whole app can be used with the keyboard alone.

| Key | Action |
|---|---|
| `Tab` / `Shift + Tab` | Move to the next or previous control |
| `Enter` on "Skip to main content" | Jump past the header |
| `1` to `5` | Go to Dashboard, Records, Add expense, Settings or About |
| `n` | Add a new expense (focus goes to the description field) |
| `/` | Search your records |
| `d` | Switch between dark and light mode |
| `?` | Open the keyboard shortcuts dialog |
| `Enter` or `Space` on a button | Press it |
| `Enter` inside an edit row | Save the edit |
| `Esc` inside an edit row | Cancel the edit |
| `Esc` in a dialog | Close the dialog |
| Arrow keys on a dropdown | Change the sort order, currency or theme |

Shortcut keys (`1`-`5`, `n`, `/`, `d`, `?`) only work when you are not typing in a field and no dialog is open.

**Focus handling:** after adding an expense, focus returns to the description field. After saving or cancelling an edit, focus returns to that row's Edit button. After deleting, focus moves to a neighbouring row (or the Records heading if none is left). Changing view moves focus to that view's heading.

---

## Accessibility notes

- **Landmarks and headings:** `header`, `nav`, `main`, `footer`, one `h1` per view and a heading order that never skips a level.
- **Skip link** is the first thing a keyboard user reaches.
- **Forms:** every input has a bound `<label>`. Hints and errors are linked with `aria-describedby`, and invalid fields get `aria-invalid="true"`. On submit, focus moves to the first invalid field.
- **Live regions:** status messages use `role="status"` (polite). Errors and the over-cap warning use `role="alert"` (assertive). The cap message switches between the two depending on whether you are under or over.
- **Visible focus:** a 3px focus ring on every control, in both themes.
- **Highlights:** search matches use the semantic `<mark>` element and are built with DOM methods (never `innerHTML`), so they are safe and readable by assistive technology.
- **Charts:** the bar chart has an `aria-label` that lists each day's total. The donut chart is paired with a text legend showing every category, amount and percentage.
- **Sortable columns** expose `aria-sort`, and every table has a caption.
- **Dialogs:** confirmations and the shortcut help use the native `<dialog>` element, which traps focus and closes with `Esc`.
- **Colour:** both themes use text and control colours chosen for strong contrast. Errors never rely on colour alone, since they also include text.
- **Motion:** `prefers-reduced-motion` turns animations and transitions off.
- **Responsive:** table rows turn into labelled cards on phones, and touch targets are at least 36px tall.

> Contrast and keyboard checks: add here which tools you used (for example WebAIM Contrast Checker, browser DevTools accessibility panel, or Lighthouse) and any results.

---

## Responsive design

Mobile first. Base styles target about 360px wide phones, with extra layout rules at **360px**, **768px** and **1024px**. Below 768px records show as cards. From 768px they show as a full table, and the dashboard and forms use multi-column grids.

Animations and transitions: bars grow in on the 7-day chart, the cap meter fills smoothly, new rows flash briefly, buttons and toasts fade, and all of it switches off for users who prefer reduced motion.

---

## How to run it

The app loads `seed.json` with `fetch`, which browsers block on `file://` addresses, so use a small local server:

```bash
# Option 1: Python
python3 -m http.server 8000

# Option 2: VS Code
# Install the "Live Server" extension, right-click index.html, choose "Open with Live Server"
```

Run the Python command from inside the project folder (the one containing `index.html`). On Windows use `python -m http.server 8000` or `py -m http.server 8000` if `python3` is not found. Then open <http://localhost:8000>. Or just use the live site linked at the top.

On the first visit the list is empty. Use **Load sample data** (on the Records empty state or in Settings) to fill it with the 24 records from `seed.json`. Recent sample dates are shifted to today so the dashboard and monthly cap have something to show.

---

## How to run the tests

Use whichever option works for you:

- **Live site (no setup):** open <https://kelvinbruce110.github.io/student-finance-tracker/tests.html>
- **VS Code Live Server:** right-click `tests.html` and choose "Open with Live Server". The address looks like `http://127.0.0.1:5500/tests.html`.
- **Python server:** run the server command from the project folder (see "How to run it"), then open <http://localhost:8000/tests.html>.

The page lists every check as **Pass** or **Fail** with a summary at the top (for example "All N tests passed.").

The tests cover every regex rule with accepted and rejected examples, the back-reference and lookahead rules, real calendar dates (including leap days), the safe regex compiler (including a broken pattern and `lastIndex` handling), match highlighting helpers, stats and cap logic, sorting, currency conversion and formatting, import validation (valid files, bad ids, string amounts, bad dates, duplicate ids, missing timestamps) and settings sanitising. A final group checks `seed.json`: at least 10 records, valid, with a leap day, a tiny and a huge amount, and a repeated-word description.

---

## Sample data (`seed.json`)

24 records built to test edge cases, including a leap day (`2024-02-29`), a 1999 date, amounts from `0.01` to `999999999.99`, a description at exactly 80 characters, accents (`Café déjà vu crêpes`), regex-looking text (`Pattern ^moto$ (a|b)* [x] \d{2}`), special characters, and repeated words (`Coffee coffee`, `Samosa samosa`).

---

## Project structure

```
index.html          App (all five views)
tests.html          In-browser test runner
seed.json           24 sample records
README.md
.gitignore
assets/
  favicon.svg
scripts/
  validators.js     Regex rules, field checks, import validation, settings sanitising
  storage.js        localStorage load/save, JSON export, import parsing, seed fetch
  state.js          App state, add/edit/delete, stats, cap logic, currency helpers
  search.js         Safe regex compiler, matching, highlighting, sorting
  ui.js             Rendering, events, dialogs, charts, shortcuts
  main.js           Starts the app
styles/
  base.css          Themes, typography, focus, skip link
  layout.css        Page layout and breakpoints
  components.css    Buttons, forms, table and cards, charts, dialogs, toasts
```

---

## Milestones

| Milestone | What was built |
|---|---|
| M1: Spec and wireframes | Data model, accessibility plan, sketches |
| M2: Semantic HTML and base CSS | Five sections, landmarks, mobile-first layout |
| M3: Forms and regex validation | Six rules (two advanced), inline errors, `tests.html` |
| M4: Render, sort and regex search | Table and cards, sorting, safe compiler, `<mark>` highlighting |
| M5: Stats and cap | Dashboard, 7-day chart, cap with polite and assertive messages |
| M6: Persistence, import/export, settings | `localStorage`, validated JSON, currency rates |
| M7: Polish and accessibility audit | Keyboard pass, transitions, README, demo video |

---

## Contact

**Kelvin Bruce Mupenzi**

- GitHub: <https://github.com/kelvinbruce110>
- Email: <b.mupenzi1@alustudent.com>