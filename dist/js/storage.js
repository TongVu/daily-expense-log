const DB_NAME = 'daybook-expenses';
const DB_VERSION = 1;
const STORE = 'expenses';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let request;
    let tx;
    try {
      tx = db.transaction(STORE, mode);
      request = action(tx.objectStore(STORE));
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    // A successful request is not a committed write until the transaction completes.
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        tx.error || request.error || new Error('Storage transaction aborted'),
      );
    };
  });
}

export async function allExpenses() {
  return (await withStore('readonly', (store) => store.getAll())) || [];
}

export function storeExpense(expense, { replace = false } = {}) {
  return withStore('readwrite', (store) =>
    replace ? store.put(expense) : store.add(expense),
  );
}

export function removeExpense(id) {
  return withStore('readwrite', (store) => store.delete(id));
}
