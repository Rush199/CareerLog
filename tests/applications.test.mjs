import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateApplication,
  followUpState,
  dashboardStats,
  filterApplications,
  localDate,
} from '../dist/applications.js';

const application = {
  id: 'a',
  company: ' Acme ',
  role: ' Engineer ',
  status: 'Applied',
  applied_on: '2026-10-20',
  follow_up: '2026-10-24',
  notes: ' test ',
};

test('application validation trims text and rejects blank, oversized, invalid status and invalid dates', () => {
  assert.equal(validateApplication(application).company, 'Acme');
  assert.equal(validateApplication(application).notes, 'test');
  assert.equal(validateApplication({ ...application, follow_up: '' }).follow_up, null);
  for (const invalid of [
    { company: '  ' },
    { role: 'x'.repeat(161) },
    { status: 'Unknown' },
    { applied_on: '2026-02-30' },
    { follow_up: 'bad-date' },
    { notes: 'x'.repeat(4001) },
  ])
    assert.throws(() => validateApplication({ ...application, ...invalid }));
});

test('follow-ups distinguish overdue/today/upcoming and exclude final outcomes from due counts', () => {
  const today = '2026-10-24';
  const apps = [
    { ...application, follow_up: '2026-10-23' },
    application,
    { ...application, status: 'Interview', follow_up: '2026-10-25' },
    { ...application, status: 'Offer' },
    { ...application, status: 'Rejected' },
    { ...application, follow_up: null },
  ];
  assert.deepEqual(
    apps.map((app) => followUpState(app, today)),
    ['overdue', 'today', 'upcoming', 'closed', 'closed', 'none'],
  );
  assert.deepEqual(dashboardStats(apps, today), { total: 6, interviews: 1, due: 2, offers: 1 });
});

test('search, status and due filters combine without changing the source records', () => {
  const apps = [application, { ...application, id: 'b', company: 'Other', status: 'Interview' }];
  assert.equal(filterApplications(apps, { search: ' ACME ' }).length, 1);
  assert.equal(
    filterApplications(apps, {
      search: 'engineer',
      status: 'Interview',
      dueOnly: true,
      today: '2026-10-24',
    })[0].id,
    'b',
  );
  assert.equal(filterApplications(apps, { search: 'missing' }).length, 0);
  assert.equal(apps.length, 2);
  assert.equal(localDate(new Date(2026, 0, 2)), '2026-01-02');
});
