import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../background.js', import.meta.url), 'utf8');

const calls = { download: [], show: [], showDefaultFolder: 0, search: [] };
let listener = null;

const chromeStub = {
  action: { onClicked: { addListener() {} } },
  runtime: {
    id: 'test-extension',
    onMessage: { addListener(fn) { listener = fn; } }
  },
  downloads: {
    async download(options) {
      calls.download.push(options);
      return 42;
    },
    async search(query) {
      calls.search.push(query);
      return [{ id: 7, filename: 'C:\\Users\\x\\Downloads\\Solstice\\Default.cfg', state: 'complete' }];
    },
    show(id) { calls.show.push(id); },
    showDefaultFolder() { calls.showDefaultFolder += 1; }
  }
};

const context = vm.createContext({
  chrome: chromeStub,
  console,
  Blob,
  URL,
  setTimeout,
  importScripts() {},
  globalThis: undefined
});
context.globalThis = context;

vm.runInContext(source, context, { filename: 'background.js' });

const send = (message) => new Promise((resolve) => {
  const kept = listener(message, {}, resolve);
  if (kept !== true) resolve(null);
});

const write = await send({ type: 'solstice/cfg', action: 'write', name: 'Default', folder: 'Solstice', content: '{"a":1}' });
const dl = calls.download[0] || {};

const results = [
  ['listener registered', Boolean(listener)],
  ['write ok', write && write.ok === true],
  ['filename under Solstice/', dl.filename === 'Solstice/Default.cfg'],
  ['overwrite conflict action', dl.conflictAction === 'overwrite'],
  ['no save-as prompt', dl.saveAs === false],
  ['blob url handed to downloads', typeof dl.url === 'string' && dl.url.startsWith('blob:')],
  ['name sanitised', (await send({ type: 'solstice/cfg', action: 'write', name: '../evil:name', folder: 'Solstice', content: '{}' })) &&
    calls.download[1].filename === 'Solstice/evilname.cfg'],
  ['open folder reveals file', (await send({ type: 'solstice/cfg', action: 'open-folder', folder: 'Solstice' }))?.ok === true &&
    calls.show[0] === 7],
  ['unknown action rejected', (await send({ type: 'solstice/cfg', action: 'nope' }))?.ok === false],
  ['other messages ignored', listener({ type: 'something-else' }, {}, () => {}) === false]
];

let failed = 0;
for (const [label, ok] of results) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}
console.log(failed === 0 ? '\nALL-PASS' : `\nFAIL-${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
