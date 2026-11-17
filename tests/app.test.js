import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { allExpenses, storeExpense } from '../dist/js/storage.js';

async function waitFor(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('UI did not reach the expected state');
}

test('calendar, optional wizard fields, edit, translation, photos, copy, and removal', async () => {
  const dom = new JSDOM(
    await readFile(new URL('../dist/index.html', import.meta.url), 'utf8'),
    { url: 'http://localhost:8080/' },
  );
  const { window } = dom;
  for (const key of ['window', 'document', 'NodeFilter', 'localStorage'])
    globalThis[key] = window[key];
  let clipboardText = '';
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text) => {
          clipboardText = text;
        },
      },
    },
  });
  window.scrollTo = () => {};
  window.confirm = () => true;
  window.HTMLInputElement.prototype.click = () => {}; // No native file picker in a DOM test.
  document.execCommand = () => false;
  URL.createObjectURL = () => 'blob:test-photo';
  URL.revokeObjectURL = () => {};
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () =>
      JSON.parse(
        await readFile(new URL(`../dist/${url}`, import.meta.url), 'utf8'),
      ),
  });
  const $ = (id) => document.getElementById(id);
  const click = (id) => $(id).click();
  const visible = (id) => !$(id).classList.contains('hidden');
  const step = () =>
    [...document.querySelectorAll('.wizard-step')].findIndex(
      (el) => !el.classList.contains('hidden'),
    );

  try {
    await import('../dist/app.js');
    await waitFor(
      () =>
        document.querySelectorAll('.calendar-day').length === 42 &&
        document.querySelector('.empty-state'),
    );
    assert.equal(document.documentElement.lang, 'vi');
    const vietnamese = JSON.parse(
      await readFile(
        new URL('../dist/locales/vi.json', import.meta.url),
        'utf8',
      ),
    );
    assert.ok(
      document
        .querySelector('.privacy-note')
        .textContent.replace(/\s+/g, ' ')
        .includes(vietnamese['Just for you']),
    );
    click('language-switcher');
    await waitFor(() => document.documentElement.lang === 'en');
    assert.equal($('calendar-heading').textContent, 'Your spending');
    assert.ok(
      document
        .querySelector('.privacy-note')
        .textContent.replace(/\s+/g, ' ')
        .includes('Just for you'),
    );
    const originalMonth = $('month-label').textContent;
    click('next-month');
    await waitFor(() => $('month-label').textContent !== originalMonth);
    click('today-button');
    await waitFor(() => $('month-label').textContent === originalMonth);
    document.querySelector('.calendar-day.today').click();
    await waitFor(() => visible('day-view'));
    assert.equal($('copy-day').disabled, true);
    click('add-expense');
    assert.equal(step(), 0);
    click('skip-photo');
    assert.equal(step(), 1);
    $('amount').value = '-1';
    click('continue-amount');
    $('expense-form').dispatchEvent(
      new window.Event('submit', { cancelable: true }),
    );
    assert.equal(step(), 1);
    assert.deepEqual(await allExpenses(), []);
    click('skip-amount');
    assert.equal(step(), 2);
    $('note').value = 'Coffee';
    $('description').value = 'Morning drink';
    $('expense-form').dispatchEvent(
      new window.Event('submit', { cancelable: true }),
    );
    await waitFor(
      () => visible('day-view') && document.querySelector('.expense-row'),
    );
    let [expense] = await allExpenses();
    assert.equal(expense.amount, null);
    assert.equal(expense.description, 'Morning drink');
    assert.equal($('copy-day').disabled, false);
    click('copy-day');
    await waitFor(() => clipboardText.includes('Coffee'));
    assert.match(clipboardText, /Morning drink/);
    assert.match(clipboardText, /amount not entered/);

    // Add a photo through storage so this also exercises rendering existing persisted blobs.
    await storeExpense(
      { ...expense, photo: new Blob(['photo'], { type: 'image/png' }) },
      { replace: true },
    );
    click('language-switcher');
    await waitFor(() => document.querySelector('.expense-photo-button'));
    document.querySelector('.expense-photo-button').click();
    assert.equal(visible('photo-lightbox'), true);
    document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape' }),
    );
    assert.equal(visible('photo-lightbox'), false);
    click('language-switcher');
    await waitFor(
      () =>
        document.documentElement.lang === 'en' &&
        $('calendar-heading').textContent === 'Your spending',
    );
    document.querySelector('.expense-menu button').click();
    assert.equal(step(), 2);
    assert.equal($('note').value, 'Coffee');
    $('note').value = 'Updated coffee';
    $('amount').value = '25.5';
    $('expense-form').dispatchEvent(
      new window.Event('submit', { cancelable: true }),
    );
    await waitFor(
      () =>
        visible('day-view') &&
        document.querySelector('.expense-note')?.textContent ===
          'Updated coffee',
    );
    [expense] = await allExpenses();
    assert.equal(expense.amount, 25.5);
    assert.equal($('day-total').textContent, '25.5');
    document.querySelector('.remove-expense').click();
    await waitFor(() => document.querySelector('.empty-state'));
    assert.deepEqual(await allExpenses(), []);
    assert.equal($('copy-day').disabled, true);
  } finally {
    window.close();
  }
});
