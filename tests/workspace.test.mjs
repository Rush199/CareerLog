import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { setupWorkspace } from '../dist/workspace.js';
import { validateApplication } from '../dist/applications.js';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const session = { user: { id: 'user-a', email: 'demo@example.test' } };
const sample = {
  id: 'app-a',
  company: 'Acme',
  role: 'Developer',
  status: 'Applied',
  applied_on: '2026-10-20',
  follow_up: '2026-10-24',
  notes: '<script>not HTML</script>',
};

function harness(overrides = {}, persisted = []) {
  const { document } = parseHTML(html);
  const $ = (selector) => document.querySelector(selector);
  const field = (name) => $(`#application-form [name="${name}"]`);
  // Supply only DOM APIs that LinkeDOM lacks; business behavior uses the real controller.
  for (const select of document.querySelectorAll('select'))
    Object.defineProperty(select, 'value', { writable: true, value: '' });
  $('#application-form').reset = () => {
    for (const name of ['id', 'company', 'role', 'status', 'applied_on', 'follow_up', 'notes'])
      field(name).value = '';
  };
  $('#editor').showModal = () => {
    $('#editor').open = true;
  };
  $('#editor').close = () => {
    $('#editor').open = false;
  };
  let listCalls = 0;
  const repository = {
    list: async () => {
      listCalls++;
      return structuredClone(persisted);
    },
    save: async (owner, input, id) => {
      const row = {
        ...validateApplication(input),
        id: id || `new-${persisted.length}`,
        user_id: owner,
      };
      const index = persisted.findIndex((app) => app.id === id);
      if (index === -1) persisted.push(row);
      else persisted[index] = row;
      return structuredClone(row);
    },
    completeFollowUp: async (owner, id) => {
      const row = persisted.find((app) => app.id === id);
      row.follow_up = null;
      return structuredClone(row);
    },
    remove: async (owner, id) => {
      persisted.splice(
        persisted.findIndex((app) => app.id === id),
        1,
      );
      return { id };
    },
    ...overrides,
  };
  const workspace = setupWorkspace({
    root: document,
    repository,
    today: () => '2026-10-24',
    confirmDelete: () => true,
    signOut: async () => workspace.showSession(null),
  });
  return {
    $,
    field,
    workspace,
    repository,
    persisted,
    listCalls: () => listCalls,
    fill: (app = sample) => {
      $('#add').onclick();
      for (const [name, value] of Object.entries(app))
        if (name !== 'id') field(name).value = value ?? '';
    },
    submit: () => $('#application-form').onsubmit({ preventDefault() {} }),
  };
}

test('create, edit status, complete follow-up, reload and delete work with persisted records', async () => {
  const stored = [];
  const h = harness({}, stored);
  await h.workspace.showSession(session);
  h.fill();
  await h.submit();
  assert.equal(stored.length, 1);
  assert.equal(h.$('#editor').open, false);
  assert.match(h.$('#rows').textContent, /Acme/);
  assert.equal(h.listCalls(), 1, 'saving must not depend on a second fetch');
  const edit = h.$('button[aria-label="Edit Acme application"]');
  edit.onclick();
  assert.equal(h.field('notes').value, sample.notes);
  h.field('status').value = 'Interview';
  await h.submit();
  assert.equal(stored[0].status, 'Interview');
  await h.$('button[aria-label="Complete follow-up for Acme"]').onclick();
  assert.equal(stored[0].follow_up, null);
  const reloaded = harness({}, stored);
  await reloaded.workspace.showSession(session);
  assert.match(reloaded.$('#rows').textContent, /Acme/);
  assert.match(reloaded.$('#rows').textContent, /Interview/);
  await reloaded.$('button[aria-label="Delete Acme application"]').onclick();
  assert.equal(stored.length, 0);
  assert.equal(reloaded.$('#empty').hidden, false);
});

test('failed save preserves editor contents and allows retry; duplicate pending submissions are blocked', async () => {
  let attempts = 0,
    finish;
  const h = harness({
    save: async () => {
      attempts++;
      if (attempts === 1) throw Error('Offline');
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  await h.workspace.showSession(session);
  h.fill();
  await h.submit();
  assert.equal(h.$('#editor').open, true);
  assert.equal(h.field('company').value, 'Acme');
  assert.equal(h.$('#form-error').textContent, 'Offline');
  assert.equal(h.$('#save').disabled, false);
  const saving = h.submit();
  await h.submit();
  assert.equal(attempts, 2);
  assert.equal(h.$('#close').disabled, true);
  finish(sample);
  await saving;
  assert.equal(h.$('#editor').open, false);
  assert.equal(h.$('#message').textContent, 'Application added.');
});

test('refresh failure is visible and does not pretend the database is empty', async () => {
  const h = harness({
    list: async () => {
      throw Error('Network unavailable');
    },
  });
  await h.workspace.showSession(session);
  assert.match(h.$('#message').textContent, /Could not refresh/);
  assert.equal(h.$('#empty').hidden, true);
  assert.equal(h.$('#reload').disabled, false);
  h.repository.list = async () => [sample];
  await h.workspace.refresh();
  assert.match(h.$('#rows').textContent, /Acme/);
  assert.equal(h.$('#message').textContent, '');
});

test('late responses after sign-out cannot reveal the previous account records', async () => {
  let finish;
  const h = harness({
    list: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const loading = h.workspace.showSession(session);
  await h.workspace.showSession(null);
  finish([sample]);
  await loading;
  assert.equal(h.$('#workspace').hidden, true);
  assert.equal(h.$('#rows').textContent, '');
  assert.equal(h.$('#stats').textContent, '');
});

test('rendering treats application text as text, and filtering keeps global statistics', async () => {
  const h = harness({}, [
    { ...sample, company: '<img src=x onerror=alert(1)>' },
    { ...sample, id: 'b', company: 'Other', status: 'Offer' },
  ]);
  await h.workspace.showSession(session);
  assert.equal(h.$('#rows img'), null);
  h.$('#search').value = 'Other';
  h.$('#search').oninput();
  assert.equal(h.$('#rows').children.length, 1);
  assert.equal(h.$('#stats strong').textContent, '2');
  await h.workspace.showSession(session);
  assert.equal(h.$('#search').value, 'Other', 'duplicate auth events must preserve UI state');
});
