const DB_NAME = 'daybook-expenses';
const DB_VERSION = 1;
const STORE = 'expenses';
let currentLanguage = (() => {
  try {
    const saved = localStorage.getItem('daybook-language');
    if (saved === 'en' || saved === 'vi') return saved;
  } catch {}
  return 'vi';
})();
let translations = {};
const englishTextNodes = new WeakMap();
const today = new Date();
let selectedDate = dateKey(today);
let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let pendingPhoto = null;
let editingExpense = null;
let photoCleared = false;
let lightboxUrl = null;
let wizardStep = 0;
let displayedDayExpenses = [];
let toastTimer;

const $ = (id) => document.getElementById(id);
const views = { calendar: $('calendar-view'), day: $('day-view'), form: $('form-view') };

function t(english) {
  return translations[english] || english;
}

async function loadTranslations() {
  const response = await fetch(`/locales/${currentLanguage}.json`);
  if (!response.ok) throw new Error(`Could not load ${currentLanguage} translations`);
  translations = await response.json();
}

function locale() {
  return currentLanguage === 'vi' ? 'vi-VN' : 'en-US';
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage;
  const languageButton = $('language-switcher');
  languageButton.dataset.language = currentLanguage;
  languageButton.setAttribute('aria-label', t('Language'));
  languageButton.setAttribute('aria-checked', String(currentLanguage === 'vi'));
  languageButton.title = t(currentLanguage === 'vi' ? 'Switch to English' : 'Switch to Vietnamese');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!englishTextNodes.has(node)) englishTextNodes.set(node, node.nodeValue);
    const original = englishTextNodes.get(node);
    const trimmed = original.trim();
    if (translations[trimmed]) {
      const leading = original.match(/^\s*/)?.[0] || '';
      const trailing = original.match(/\s*$/)?.[0] || '';
      node.nodeValue = `${leading}${t(trimmed)}${trailing}`;
    }
  }
  document.title = currentLanguage === 'vi' ? 'Daybook — Chi tiêu hằng ngày' : 'Daybook — Daily expenses';
  document.querySelector('meta[name="description"]').content = currentLanguage === 'vi'
    ? 'Nơi riêng tư để ghi lại các khoản chi hằng ngày.'
    : 'A quiet, private place to keep track of daily spending.';
  $('note').placeholder = t('Coffee, groceries, bus fare…');
  $('description').placeholder = t('Add more context about this expense…');
  $('amount').setAttribute('aria-label', t('Amount'));
  $('calendar-grid').setAttribute('aria-label', t('Calendar'));
  $('prev-month').setAttribute('aria-label', t('Previous month'));
  $('next-month').setAttribute('aria-label', t('Next month'));
  $('brand-home').setAttribute('aria-label', t('Daybook home'));
  $('close-photo').setAttribute('aria-label', t('Close photo'));
  $('lightbox-image').alt = t('Expanded expense photo');
  $('photo-lightbox').setAttribute('aria-label', t('Expense photo'));
}

function formatEntryCount(count) {
  return currentLanguage === 'vi' ? `${count} khoản` : `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

function formatExpenseCount(count) {
  return currentLanguage === 'vi' ? `${count} khoản chi` : `${count} ${count === 1 ? 'expense' : 'expenses'}`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fromKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date, options = { weekday: 'long', month: 'long', day: 'numeric' }) {
  return new Intl.DateTimeFormat(locale(), options).format(date);
}

function formatAmount(amount) {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(amount);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function allExpenses() {
  return (await withStore('readonly', (store) => store.getAll())) || [];
}

function showView(name) {
  Object.entries(views).forEach(([key, view]) => view.classList.toggle('hidden', key !== name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function notify(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function legacyCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  textarea.style.fontSize = '16px';
  document.body.append(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { copied = false; }
  textarea.remove();
  return copied;
}

function writeClipboardText(text) {
  let clipboardWrite;
  try {
    if (navigator.clipboard?.writeText) clipboardWrite = navigator.clipboard.writeText(text);
  } catch { clipboardWrite = null; }
  const fallbackCopied = legacyCopyText(text);
  if (clipboardWrite) return clipboardWrite.then(() => true, () => fallbackCopied);
  return Promise.resolve(fallbackCopied);
}

async function copyExpenseForSheets(expense) {
  const date = formatDate(fromKey(expense.date), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const lines = [`${t('Date:')} ${date}`, `${t('Amount:')} ${expense.amount == null ? t('not entered') : formatAmount(expense.amount)}`, `${t('Expense:')} ${expense.note || t('Untitled expense')}`];
  if (expense.description) lines.push(`${t('Details:')} ${expense.description}`);
  if (expense.photo) lines.push(t('Photo: attached in Daybook'));
  try {
    if (!await writeClipboardText(lines.join('\n'))) throw new Error('Clipboard unavailable');
    notify(t('Copied. Paste it into a Google Sheets note.'));
  } catch {
    notify(t('Could not copy. Please try again from the secure app link.'));
  }
}

async function copyDayForSheets() {
  const expenses = displayedDayExpenses;
  if (!expenses.length) return;
  const date = formatDate(fromKey(selectedDate), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const total = expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const lines = [date, `${t('Daily total:')} ${formatAmount(total)}`, '', `${t('Expenses')}:`];
  expenses.forEach((expense, index) => {
    const time = new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(expense.createdAt));
    const amount = expense.amount == null ? t('amount not entered') : formatAmount(expense.amount);
    lines.push(`${index + 1}. ${time} — ${expense.note || t('Untitled expense')} | ${amount}`);
    if (expense.description) lines.push(`   ${t('Details:')} ${expense.description}`);
    if (expense.photo) lines.push(`   ${t('Photo: attached in Daybook')}`);
  });
  try {
    if (!await writeClipboardText(lines.join('\n'))) throw new Error('Clipboard unavailable');
    notify(currentLanguage === 'vi'
      ? `Đã sao chép ${formatExpenseCount(expenses.length)}. Hãy dán vào ghi chú trong Google Sheets.`
      : `Copied ${formatExpenseCount(expenses.length)}. Paste into a Google Sheets note.`);
  } catch {
    notify(t('Could not copy. Please try again from the secure app link.'));
  }
}

async function renderCalendar() {
  $('month-label').textContent = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(visibleMonth);
  const expenses = await allExpenses();
  const expenseDates = new Set(expenses.map((expense) => expense.date));
  const monthPrefix = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, '0')}-`;
  const monthExpenses = expenses.filter((expense) => expense.date.startsWith(monthPrefix));
  const monthTotal = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  $('month-total').textContent = formatAmount(monthTotal);
  $('month-total-caption').textContent = formatExpenseCount(monthExpenses.length);
  const firstWeekday = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const daysInPreviousMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 0).getDate();
  const grid = $('calendar-grid');
  grid.replaceChildren();

  for (let index = 0; index < 42; index += 1) {
    let dayNumber;
    let date;
    let isOutside = false;
    if (index < firstWeekday) {
      dayNumber = daysInPreviousMonth - firstWeekday + index + 1;
      date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, dayNumber);
      isOutside = true;
    } else if (index >= firstWeekday + daysInMonth) {
      dayNumber = index - (firstWeekday + daysInMonth) + 1;
      date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, dayNumber);
      isOutside = true;
    } else {
      dayNumber = index - firstWeekday + 1;
      date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), dayNumber);
    }

    const key = dateKey(date);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `calendar-day${isOutside ? ' outside' : ''}${key === dateKey(today) ? ' today' : ''}${key === selectedDate ? ' selected' : ''}`;
    button.setAttribute('role', 'gridcell');
    button.setAttribute('aria-label', `${formatDate(date)}, ${t(expenseDates.has(key) ? 'has expenses' : 'no expenses')}`);
    button.setAttribute('aria-pressed', String(key === selectedDate));
    button.append(document.createTextNode(String(dayNumber)));
    if (expenseDates.has(key)) {
      const dot = document.createElement('span');
      dot.className = 'day-dot';
      dot.setAttribute('aria-hidden', 'true');
      button.append(dot);
    }
    button.addEventListener('click', () => {
      selectedDate = key;
      renderDay();
      showView('day');
    });
    grid.append(button);
  }
}

function iconFor(note) {
  const value = note.toLowerCase();
  if (/coffee|tea|drink|cafe/.test(value)) return '☕';
  if (/food|lunch|dinner|breakfast|grocer|market|meal/.test(value)) return '◒';
  if (/bus|train|taxi|ride|fuel|gas|transport/.test(value)) return '↗';
  if (/book|movie|music|game/.test(value)) return '✳';
  return '◌';
}

async function renderDay() {
  const date = fromKey(selectedDate);
  $('day-title').textContent = formatDate(date);
  $('stamp-month').textContent = new Intl.DateTimeFormat(locale(), { month: 'short' }).format(date);
  $('stamp-day').textContent = String(date.getDate()).padStart(2, '0');
  const expenses = (await allExpenses()).filter((expense) => expense.date === selectedDate).sort((a, b) => b.createdAt - a.createdAt);
  displayedDayExpenses = expenses;
  const total = expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  $('day-total').textContent = formatAmount(total);
  $('expense-count').textContent = formatEntryCount(expenses.length);
  $('copy-day').disabled = expenses.length === 0;
  const list = $('expense-list');
  list.querySelectorAll('img').forEach((image) => { if (image.src.startsWith('blob:')) URL.revokeObjectURL(image.src); });
  list.replaceChildren();

  if (!expenses.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<span class="empty-icon" aria-hidden="true">＋</span><h3>${t('A fresh page')}</h3><p>${t('No expenses logged for this day yet. Add one whenever you’re ready.')}</p>`;
    list.append(empty);
    return;
  }

  for (const expense of expenses) {
    const row = document.createElement('article');
    row.className = 'expense-row';
    const icon = document.createElement('span');
    icon.className = 'expense-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = iconFor(expense.note);
    const copy = document.createElement('div');
    copy.className = 'expense-copy';
    const note = document.createElement('div');
    note.className = 'expense-note';
    note.textContent = expense.note || t('Expense');
    if (expense.description) {
      const description = document.createElement('div');
      description.className = 'expense-description';
      description.textContent = expense.description;
      copy.append(note, description);
    } else {
      copy.append(note);
    }
    const meta = document.createElement('div');
    meta.className = 'expense-meta';
    meta.textContent = new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(expense.createdAt));
    copy.append(meta);
    row.append(icon, copy);
    if (expense.photo) {
      const photoButton = document.createElement('button');
      photoButton.type = 'button';
      photoButton.className = 'expense-photo-button';
      photoButton.setAttribute('aria-label', `${t('View photo for')} ${expense.note || t('Expense')}`);
      const image = document.createElement('img');
      image.src = URL.createObjectURL(expense.photo);
      image.alt = '';
      photoButton.append(image);
      photoButton.addEventListener('click', () => openPhoto(expense.photo));
      row.append(photoButton);
    }
    const amount = document.createElement('strong');
    amount.className = 'expense-amount';
    amount.textContent = expense.amount == null ? t('No amount') : formatAmount(expense.amount);
    row.append(amount);
    const actions = document.createElement('details');
    actions.className = 'expense-actions';
    const menuButton = document.createElement('summary');
    menuButton.setAttribute('aria-label', `${t('Options for')} ${expense.note || t('Expense').toLowerCase()}`);
    menuButton.textContent = '⋯';
    const menu = document.createElement('div');
    menu.className = 'expense-menu';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = t('Edit expense');
    editButton.addEventListener('click', () => { actions.open = false; startEditExpense(expense); });
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.textContent = t('Copy for Sheets');
    copyButton.addEventListener('click', async () => { actions.open = false; await copyExpenseForSheets(expense); });
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-expense';
    removeButton.textContent = t('Remove expense');
    removeButton.addEventListener('click', async () => {
      actions.open = false;
      const confirmation = currentLanguage === 'vi'
        ? `Xóa “${expense.note || t('Expense')}” khỏi ngày này? Thao tác này không thể hoàn tác.`
        : `Remove “${expense.note || 'Expense'}” from this day? This can’t be undone.`;
      if (!window.confirm(confirmation)) return;
      try {
        await withStore('readwrite', (store) => store.delete(expense.id));
        await renderDay();
        await renderCalendar();
        notify(t('Expense removed.'));
      } catch {
        notify(t('Could not remove this expense. Please try again.'));
      }
    });
    menu.append(editButton, copyButton, removeButton);
    actions.append(menuButton, menu);
    row.append(actions);
    list.append(row);
  }
}

function setWizardStep(step) {
  wizardStep = Math.max(0, Math.min(2, step));
  document.querySelectorAll('.wizard-step').forEach((section, index) => section.classList.toggle('hidden', index !== wizardStep));
  $('wizard-count').textContent = currentLanguage === 'vi' ? `Bước ${wizardStep + 1}/3` : `${wizardStep + 1} of 3`;
  const titles = editingExpense ? ['Edit photo', 'Edit amount', 'Edit details'] : ['Add a photo', 'Add an amount', 'Expense details'];
  $('form-title').textContent = t(titles[wizardStep]);
  $('cancel-form').innerHTML = wizardStep === 0
    ? `<span aria-hidden="true">←</span> ${t('Back to the day')}`
    : `<span aria-hidden="true">←</span> ${t('Back')}`;
}

function startAddExpense() {
  $('form-date').textContent = formatDate(fromKey(selectedDate));
  $('expense-form').reset();
  editingExpense = null;
  photoCleared = false;
  pendingPhoto = null;
  $('edit-date-field').classList.add('hidden');
  $('photo').value = '';
  $('photo-preview').replaceChildren();
  $('photo-preview').classList.add('hidden');
  setWizardStep(0);
  showView('form');
  $('photo').click();
}

function showPhotoPreview(photo) {
  const preview = $('photo-preview');
  preview.replaceChildren();
  if (!photo) { preview.classList.add('hidden'); return; }
  const image = document.createElement('img');
  image.src = URL.createObjectURL(photo);
  image.alt = 'Photo attached to expense';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove-photo';
  remove.setAttribute('aria-label', t('Remove photo'));
  remove.textContent = '×';
  remove.addEventListener('click', () => {
    pendingPhoto = null;
    photoCleared = true;
    preview.replaceChildren();
    preview.classList.add('hidden');
    $('photo').value = '';
  });
  preview.append(image, remove);
  preview.classList.remove('hidden');
}

function startEditExpense(expense) {
  editingExpense = expense;
  pendingPhoto = null;
  photoCleared = false;
  $('expense-form').reset();
  $('form-date').textContent = t('Update the details below.');
  $('amount').value = expense.amount == null ? '' : String(expense.amount);
  $('note').value = expense.note || '';
  $('description').value = expense.description || '';
  $('edit-date').value = expense.date;
  $('edit-date-field').classList.remove('hidden');
  $('photo').value = '';
  showPhotoPreview(expense.photo);
  setWizardStep(2);
  showView('form');
  $('note').focus({ preventScroll: true });
}

function openPhoto(photo) {
  closePhoto();
  lightboxUrl = URL.createObjectURL(photo);
  $('lightbox-image').src = lightboxUrl;
  $('photo-lightbox').classList.remove('hidden');
  $('close-photo').focus();
}

function closePhoto() {
  $('photo-lightbox').classList.add('hidden');
  $('lightbox-image').removeAttribute('src');
  if (lightboxUrl) URL.revokeObjectURL(lightboxUrl);
  lightboxUrl = null;
}

async function blobFromFile(file) {
  return file;
}

$('prev-month').addEventListener('click', () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1); renderCalendar(); });
$('next-month').addEventListener('click', () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1); renderCalendar(); });
$('today-button').addEventListener('click', () => { selectedDate = dateKey(today); visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1); renderCalendar(); });
$('back-calendar').addEventListener('click', () => { visibleMonth = new Date(fromKey(selectedDate).getFullYear(), fromKey(selectedDate).getMonth(), 1); renderCalendar(); showView('calendar'); });
$('add-expense').addEventListener('click', startAddExpense);
$('copy-day').addEventListener('click', copyDayForSheets);
$('cancel-form').addEventListener('click', () => {
  if (wizardStep > 0) { setWizardStep(wizardStep - 1); return; }
  renderDay();
  showView('day');
});
$('skip-photo').addEventListener('click', () => setWizardStep(1));
$('continue-photo').addEventListener('click', () => setWizardStep(1));
$('skip-amount').addEventListener('click', () => { $('amount').value = ''; setWizardStep(2); $('note').focus({ preventScroll: true }); });
$('continue-amount').addEventListener('click', () => { setWizardStep(2); $('note').focus({ preventScroll: true }); });
$('skip-details').addEventListener('click', () => saveExpense(null, true));
$('close-photo').addEventListener('click', closePhoto);
$('photo-lightbox').addEventListener('click', (event) => { if (event.target === $('photo-lightbox')) closePhoto(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('photo-lightbox').classList.contains('hidden')) closePhoto(); });

$('photo').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { notify(t('Please choose an image file.')); return; }
  try {
    pendingPhoto = await blobFromFile(file);
    photoCleared = false;
    showPhotoPreview(pendingPhoto);
    setWizardStep(1);
  } catch {
    notify(t('That photo could not be opened. You can still save the expense.'));
  }
});

async function saveExpense(event, skipDetails = false) {
  if (event) event.preventDefault();
  const amountText = $('amount').value.trim();
  const amount = amountText === '' ? null : Number(amountText);
  const note = skipDetails ? '' : $('note').value.trim();
  const description = skipDetails ? '' : $('description').value.trim();
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
    setWizardStep(1);
    $('amount').focus({ preventScroll: true });
    notify(t('Enter an amount greater than zero, or skip this step.'));
    return;
  }
  const wasEditing = Boolean(editingExpense);
  const expense = {
    id: editingExpense?.id || crypto.randomUUID(),
    date: wasEditing ? $('edit-date').value : selectedDate,
    amount,
    note,
    description,
    photo: pendingPhoto || (photoCleared ? null : editingExpense?.photo || null),
    createdAt: editingExpense?.createdAt || Date.now(),
  };
  try {
    await withStore('readwrite', (store) => wasEditing ? store.put(expense) : store.add(expense));
    selectedDate = expense.date;
    editingExpense = null;
    pendingPhoto = null;
    photoCleared = false;
    await renderDay();
    visibleMonth = new Date(fromKey(selectedDate).getFullYear(), fromKey(selectedDate).getMonth(), 1);
    await renderCalendar();
    showView('day');
    notify(t(wasEditing ? 'Expense updated.' : 'Expense saved on this device.'));
  } catch {
    notify(t('Could not save this expense. Your browser may be low on storage.'));
  }
}

$('expense-form').addEventListener('submit', saveExpense);
$('language-switcher').addEventListener('click', async () => {
  currentLanguage = currentLanguage === 'vi' ? 'en' : 'vi';
  await loadTranslations();
  try { localStorage.setItem('daybook-language', currentLanguage); } catch {}
  applyLanguage();
  await Promise.all([renderCalendar(), renderDay()]);
  if (!views.form.classList.contains('hidden')) {
    setWizardStep(wizardStep);
    $('form-date').textContent = editingExpense ? t('Update the details below.') : formatDate(fromKey(selectedDate));
  }
});

async function start() {
  try {
    await loadTranslations();
    applyLanguage();
    await renderCalendar();
    await renderDay();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  } catch {
    notify(t('Local storage is unavailable in this browser.'));
  }
}

start();
