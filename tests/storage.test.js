import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  allExpenses,
  storeExpense,
  removeExpense,
} from '../dist/js/storage.js';

test('existing database schema supports create, read, update, photos, and delete', async () => {
  assert.deepEqual(await allExpenses(), []);
  const expense = {
    id: 'storage-test',
    date: '2026-11-17',
    amount: null,
    note: 'Coffee',
    description: 'With a receipt',
    photo: new Blob(['receipt'], { type: 'image/png' }),
    createdAt: 123,
  };
  await storeExpense(expense);
  let [saved] = await allExpenses();
  assert.equal(saved.id, expense.id);
  assert.equal(saved.amount, null);
  assert.equal(await saved.photo.text(), 'receipt');
  await assert.rejects(storeExpense(expense), { name: 'ConstraintError' });
  await storeExpense(
    { ...expense, amount: 42, note: 'Updated' },
    { replace: true },
  );
  [saved] = await allExpenses();
  assert.equal(saved.amount, 42);
  assert.equal(saved.note, 'Updated');
  assert.equal(saved.createdAt, 123);
  await removeExpense(expense.id);
  assert.deepEqual(await allExpenses(), []);
});
