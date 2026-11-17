import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  currentLanguage,
  loadTranslations,
  toggleLanguage,
  t,
  locale,
  formatEntryCount,
  formatExpenseCount,
} from '../dist/js/i18n.js';
import { dateKey, fromKey, formatAmount } from '../dist/js/formatting.js';

const fetchLocale = async (url) => ({
  ok: true,
  json: async () =>
    JSON.parse(
      await readFile(new URL(`../dist/${url}`, import.meta.url), 'utf8'),
    ),
});

test('locale switch is reversible and a failed fetch preserves the active language', async () => {
  globalThis.fetch = fetchLocale;
  await loadTranslations();
  assert.equal(currentLanguage, 'vi');
  assert.equal(locale(), 'vi-VN');
  assert.equal(t('Your spending'), 'Chi tiêu của bạn');
  assert.equal(formatEntryCount(2), '2 khoản');
  assert.equal(
    formatAmount(1234.5),
    new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(1234.5),
  );
  await toggleLanguage();
  assert.equal(currentLanguage, 'en');
  assert.equal(t('Your spending'), 'Your spending');
  assert.equal(formatEntryCount(1), '1 entry');
  assert.equal(formatEntryCount(2), '2 entries');
  assert.equal(formatExpenseCount(1), '1 expense');
  assert.equal(t('Untranslated fallback'), 'Untranslated fallback');
  globalThis.fetch = async () => ({ ok: false });
  await assert.rejects(toggleLanguage(), /Could not load vi translations/);
  assert.equal(currentLanguage, 'en');
  assert.equal(t('Your spending'), 'Your spending');
  globalThis.fetch = fetchLocale;
  await toggleLanguage();
  assert.equal(currentLanguage, 'vi');
});

test('date keys round-trip in local time, including month and year boundaries', () => {
  for (const key of ['2024-02-29', '2026-01-01', '2026-12-31']) {
    assert.equal(dateKey(fromKey(key)), key);
  }
});
