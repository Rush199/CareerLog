import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../dist/repository.js';

function clientWithResponses(responses) {
  const calls = [];
  const client = {
    from(table) {
      const call = { table, steps: [] };
      calls.push(call);
      const query = {};
      for (const method of ['select', 'eq', 'order', 'range', 'update', 'insert', 'delete']) {
        query[method] = (...args) => {
          call.steps.push([method, ...args]);
          return query;
        };
      }
      query.then = (resolve, reject) => Promise.resolve(responses.shift()).then(resolve, reject);
      return query;
    },
  };
  return { client, calls };
}
const payload = {
  company: 'Acme',
  role: 'Engineer',
  status: 'Applied',
  applied_on: '2026-10-24',
  follow_up: '',
  notes: '',
};

test('repository fetches all batches and propagates page failures instead of returning partial totals', async () => {
  const fixture = clientWithResponses([{ data: [{ id: 1 }, { id: 2 }] }, { data: [{ id: 3 }] }]);
  assert.deepEqual(await createRepository(fixture.client, 2).list('owner'), [
    { id: 1 },
    { id: 2 },
    { id: 3 },
  ]);
  assert.deepEqual(
    fixture.calls.map((call) => call.steps.find((step) => step[0] === 'range')),
    [
      ['range', 0, 1],
      ['range', 2, 3],
    ],
  );
  assert.ok(
    fixture.calls.every((call) =>
      call.steps.some((step) => step[0] === 'eq' && step[1] === 'user_id' && step[2] === 'owner'),
    ),
  );
  const failure = clientWithResponses([
    { data: [{ id: 1 }, { id: 2 }] },
    { error: Error('Offline') },
  ]);
  await assert.rejects(createRepository(failure.client, 2).list('owner'), /Offline/);
});

test('writes use the current owner, return persisted values, and reject invalid payloads before network access', async () => {
  const fixture = clientWithResponses([
    { data: [{ ...payload, id: 'server-id', user_id: 'owner' }] },
  ]);
  const repo = createRepository(fixture.client);
  assert.equal((await repo.save('owner', payload)).id, 'server-id');
  assert.equal(fixture.calls[0].steps.find((step) => step[0] === 'insert')[1].user_id, 'owner');
  await assert.rejects(repo.save('owner', { ...payload, company: '' }), /company/);
  await assert.rejects(repo.list(''), /sign in/);
  assert.equal(fixture.calls.length, 1);
});

test('missing or denied writes do not report successful edits or deletes', async () => {
  const fixture = clientWithResponses([{ data: [] }, { error: Error('permission denied') }]);
  const repo = createRepository(fixture.client);
  await assert.rejects(repo.save('owner', payload, 'other-id'), /unavailable/);
  await assert.rejects(repo.remove('owner', 'other-id'), /permission denied/);
  assert.ok(
    fixture.calls.every((call) =>
      call.steps.some((step) => step[0] === 'eq' && step[1] === 'user_id'),
    ),
  );
});
