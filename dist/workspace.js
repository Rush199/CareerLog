import { dashboardStats, filterApplications, followUpState, localDate } from './applications.js';

export function setupWorkspace({
  repository,
  root = document,
  signOut,
  confirmDelete = (message) => confirm(message),
  today = localDate,
}) {
  const $ = (selector) => root.querySelector(selector);
  const form = $('#application-form');
  const field = (name) => form.querySelector(`[name="${name}"]`);
  let user = null,
    records = [],
    epoch = 0,
    loading = false,
    busy = false,
    failed = false;

  function element(tag, text = '', className = '') {
    const node = root.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function tell(text, error = false) {
    $('#message').textContent = text;
    $('#message').dataset.kind = error ? 'error' : 'info';
  }
  function dateLabel(value) {
    return value
      ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '—';
  }
  function setControls() {
    $('#add').disabled = busy || loading;
    $('#reload').disabled = busy || loading;
    $('#save').disabled = busy;
    $('#save').textContent = busy ? 'Saving…' : 'Save application';
    $('#close').disabled = busy;
    form.querySelectorAll('input, select, textarea').forEach((input) => {
      input.disabled = busy;
    });
    root.querySelectorAll('.row-action').forEach((button) => {
      button.disabled = busy || loading;
    });
    $('#workspace').setAttribute('aria-busy', String(loading || busy));
  }
  function render() {
    const stats = dashboardStats(records, today());
    $('#stats').replaceChildren();
    for (const [label, key] of [
      ['Total applications', 'total'],
      ['In conversation', 'interviews'],
      ['Follow-ups due', 'due'],
      ['Offers received', 'offers'],
    ]) {
      const card = element('div', '', 'stat');
      card.append(element('span', label), element('strong', failed ? '—' : String(stats[key])));
      $('#stats').append(card);
    }
    const rows = filterApplications(records, {
      search: $('#search').value,
      status: $('#filter').value,
      dueOnly: $('#due-only').checked,
      today: today(),
    });
    $('#count').textContent = loading
      ? 'Loading…'
      : `${rows.length} ${rows.length === 1 ? 'opportunity' : 'opportunities'}`;
    $('#rows').replaceChildren();
    $('#empty').hidden = rows.length > 0 || loading || failed;
    $('#empty h3').textContent = records.length
      ? 'No matching applications.'
      : 'Your next opportunity starts here.';
    $('#empty p').textContent = records.length
      ? 'Try another search, status, or follow-up filter.'
      : 'Add your first application to get started.';
    for (const app of rows) {
      const row = element('tr'),
        company = element('td'),
        status = element('td');
      company.append(element('strong', app.company), element('small', app.role));
      status.append(element('span', app.status, `status ${app.status}`));
      const followUp = element('td', dateLabel(app.follow_up));
      const state = followUpState(app, today());
      if (['overdue', 'today', 'upcoming'].includes(state)) {
        followUp.append(
          element(
            'small',
            { overdue: 'Overdue', today: 'Due today', upcoming: 'Upcoming' }[state],
            `follow-up ${state}`,
          ),
        );
        const done = element('button', 'Done', 'row-action');
        done.type = 'button';
        done.setAttribute('aria-label', `Complete follow-up for ${app.company}`);
        done.onclick = () =>
          mutate(() => repository.completeFollowUp(user.id, app.id), 'Follow-up cleared.', false);
        followUp.append(done);
      }
      const actions = element('td'),
        edit = element('button', 'Edit', 'row-action'),
        remove = element('button', 'Delete', 'row-action');
      edit.type = 'button';
      edit.setAttribute('aria-label', `Edit ${app.company} application`);
      edit.onclick = () => openEditor(app);
      remove.type = 'button';
      remove.setAttribute('aria-label', `Delete ${app.company} application`);
      remove.onclick = () => {
        if (
          !busy &&
          confirmDelete(`Delete your ${app.company} application? This cannot be undone.`)
        ) {
          return mutate(
            () => repository.remove(user.id, app.id),
            'Application deleted.',
            false,
            app.id,
          );
        }
      };
      actions.append(edit, remove);
      row.append(company, status, element('td', dateLabel(app.applied_on)), followUp, actions);
      $('#rows').append(row);
    }
    setControls();
  }

  async function refresh() {
    if (!user || loading || busy) return;
    const requestEpoch = epoch,
      userId = user.id;
    loading = true;
    tell('Loading applications…');
    render();
    try {
      const result = await repository.list(userId);
      if (requestEpoch !== epoch) return;
      records = result;
      failed = false;
      tell('');
    } catch (error) {
      if (requestEpoch !== epoch) return;
      failed = true;
      tell(`Could not refresh applications. ${error.message} Use Refresh to retry.`, true);
    } finally {
      if (requestEpoch === epoch) {
        loading = false;
        render();
      }
    }
  }

  // Use the server's write response: a later fetch must not make a successful save look failed.
  async function mutate(action, message, closeEditor, removedId) {
    if (!user || busy || loading) return;
    const requestEpoch = epoch;
    busy = true;
    $('#form-error').textContent = '';
    setControls();
    try {
      const saved = await action();
      if (requestEpoch !== epoch) return;
      if (removedId) records = records.filter((app) => app.id !== removedId);
      else {
        const existing = records.findIndex((app) => app.id === saved.id);
        if (existing === -1) records.unshift(saved);
        else records[existing] = saved;
      }
      failed = false;
      if (closeEditor) $('#editor').close();
      tell(message);
    } catch (error) {
      if (requestEpoch !== epoch) return;
      if (closeEditor) $('#form-error').textContent = error.message;
      else tell(error.message, true);
    } finally {
      if (requestEpoch === epoch) {
        busy = false;
        render();
      }
    }
  }

  function openEditor(app) {
    if (!user || busy || loading) return;
    form.reset();
    $('#form-error').textContent = '';
    $('#editor-title').textContent = app ? 'Edit application' : 'New application';
    for (const name of ['id', 'company', 'role', 'status', 'applied_on', 'follow_up', 'notes']) {
      field(name).value =
        app?.[name] ?? (name === 'applied_on' ? today() : name === 'status' ? 'Applied' : '');
    }
    $('#editor').showModal();
    field('company').focus();
  }

  async function showSession(session) {
    const nextUser = session?.user ?? null;
    if (nextUser?.id && nextUser.id === user?.id) {
      $('#workspace').hidden = false;
      $('#auth').hidden = true;
      $('#add').hidden = false;
      return;
    }
    epoch++;
    user = nextUser;
    records = [];
    busy = false;
    loading = false;
    failed = false;
    $('#workspace').hidden = !user;
    $('#auth').hidden = Boolean(user);
    $('#add').hidden = !user;
    $('#account').replaceChildren();
    $('#rows').replaceChildren();
    $('#stats').replaceChildren();
    $('#search').value = '';
    $('#filter').value = '';
    $('#due-only').checked = false;
    $('#editor').close();
    form.reset();
    $('#form-error').textContent = '';
    tell('');
    if (user) {
      $('#account').append(element('span', user.email));
      const logout = element('button', 'Sign out');
      logout.type = 'button';
      logout.onclick = async () => {
        logout.disabled = true;
        try {
          await signOut();
        } catch (error) {
          tell(error.message, true);
        } finally {
          logout.disabled = false;
        }
      };
      $('#account').append(logout);
      await refresh();
    } else $('#account').append(element('span', 'C', 'avatar'));
  }

  $('#add').onclick = () => openEditor();
  $('#close').onclick = () => {
    if (!busy) $('#editor').close();
  };
  $('#editor').addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  form.onsubmit = (event) => {
    event.preventDefault();
    const id = field('id').value;
    const payload = Object.fromEntries(
      ['company', 'role', 'status', 'applied_on', 'follow_up', 'notes'].map((name) => [
        name,
        field(name).value,
      ]),
    );
    return mutate(
      () => repository.save(user.id, payload, id),
      id ? 'Application updated.' : 'Application added.',
      true,
    );
  };
  $('#search').oninput = render;
  $('#filter').onchange = render;
  $('#due-only').onchange = render;
  $('#reload').onclick = refresh;
  return { showSession, refresh };
}
