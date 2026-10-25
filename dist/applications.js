export const STATUSES = ['Applied', 'Interview', 'Offer', 'Rejected'];

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateApplication(input) {
  const value = {
    company: String(input.company ?? '').trim(),
    role: String(input.role ?? '').trim(),
    status: input.status,
    applied_on: input.applied_on,
    follow_up: input.follow_up || null,
    notes: String(input.notes ?? '').trim(),
  };
  if (!value.company || value.company.length > 120)
    throw Error('Enter a company name between 1 and 120 characters.');
  if (!value.role || value.role.length > 160)
    throw Error('Enter a role between 1 and 160 characters.');
  if (!STATUSES.includes(value.status)) throw Error('Choose a valid application status.');
  if (!validDate(value.applied_on)) throw Error('Choose a valid application date.');
  if (value.follow_up && !validDate(value.follow_up)) throw Error('Choose a valid follow-up date.');
  if (value.notes.length > 4000) throw Error('Keep notes within 4,000 characters.');
  return value;
}

export function followUpState(application, today = localDate()) {
  if (!application.follow_up) return 'none';
  if (['Offer', 'Rejected'].includes(application.status)) return 'closed';
  if (application.follow_up < today) return 'overdue';
  if (application.follow_up === today) return 'today';
  return 'upcoming';
}

export function dashboardStats(applications, today = localDate()) {
  return {
    total: applications.length,
    interviews: applications.filter((app) => app.status === 'Interview').length,
    due: applications.filter((app) => ['overdue', 'today'].includes(followUpState(app, today)))
      .length,
    offers: applications.filter((app) => app.status === 'Offer').length,
  };
}

export function filterApplications(
  applications,
  { search = '', status = '', dueOnly = false, today = localDate() } = {},
) {
  const query = search.trim().toLowerCase();
  return applications.filter(
    (app) =>
      (!status || app.status === status) &&
      `${app.company} ${app.role}`.toLowerCase().includes(query) &&
      (!dueOnly || ['overdue', 'today'].includes(followUpState(app, today))),
  );
}
