import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import postcss from 'postcss';

const dist = new URL('../dist/', import.meta.url);

test('CSS has no duplicate selectors or declarations within the same cascade scope', async () => {
  const root = postcss.parse(
    await readFile(new URL('styles.css', dist), 'utf8'),
  );
  function checkScope(scope) {
    const selectors = new Set();
    for (const node of scope.nodes || []) {
      if (node.type === 'atrule') checkScope(node);
      if (node.type !== 'rule') continue;
      assert.ok(
        !selectors.has(node.selector),
        `Duplicate selector: ${node.selector}`,
      );
      selectors.add(node.selector);
      const properties = new Set();
      for (const declaration of node.nodes.filter(
        (child) => child.type === 'decl',
      )) {
        assert.ok(
          !properties.has(declaration.prop),
          `Duplicate ${declaration.prop} in ${node.selector}`,
        );
        properties.add(declaration.prop);
      }
    }
  }
  checkScope(root);
});

test('service worker precaches every shipped file, including imported modules', async () => {
  const source = await readFile(new URL('service-worker.js', dist), 'utf8');
  const { files, cacheName } = vm.runInNewContext(
    `${source}\n;({files: APP_FILES, cacheName: CACHE_NAME});`,
    { self: { addEventListener() {} } },
  );
  assert.match(cacheName, /^daybook-static-v\d+$/);
  const cached = new Set(files);
  async function checkDirectory(path = '') {
    for (const entry of await readdir(new URL(path, dist), {
      withFileTypes: true,
    })) {
      const relative = `${path}${entry.name}`;
      if (entry.isDirectory()) await checkDirectory(`${relative}/`);
      else if (relative !== 'service-worker.js')
        assert.ok(
          cached.has(`./${relative}`),
          `Offline asset missing: ${relative}`,
        );
    }
  }
  await checkDirectory();
  for (const file of cached) {
    if (file !== './') await readFile(new URL(file, dist));
  }
});

test('English and Vietnamese dictionaries have matching keys', async () => {
  const english = JSON.parse(
    await readFile(new URL('locales/en.json', dist), 'utf8'),
  );
  const vietnamese = JSON.parse(
    await readFile(new URL('locales/vi.json', dist), 'utf8'),
  );
  assert.deepEqual(Object.keys(english).sort(), Object.keys(vietnamese).sort());
});
