import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { setupAuth } from '../dist/auth.js';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const redirectTo = 'https://careerlog-rush199.livelytrout2.chatgpt.site';
const email = 'learner@example.test';
const password = 'Test-password-123';
const success = { data: { session: null }, error: null };

function harness(overrides = {}) {
  const { document } = parseHTML(html);
  const $ = (selector) => document.querySelector(selector);
  const calls = [];
  const sessions = [];
  let authEvent;
  let time = 100000;
  const method =
    (name) =>
    async (...args) => {
      calls.push({ name, args });
      return overrides[name] ? overrides[name](...args) : success;
    };
  const auth = {
    signUp: method('signUp'),
    signInWithPassword: method('signInWithPassword'),
    resend: method('resend'),
    resetPasswordForEmail: method('resetPasswordForEmail'),
    updateUser: method('updateUser'),
    getSession: method('getSession'),
    onAuthStateChange(callback) {
      authEvent = callback;
    },
  };
  // LinkeDOM does not implement browser constraint validation. These tests
  // exercise the auth controller, not the browser's built-in email validator.
  $('#email').checkValidity = () => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test($('#email').value);
  const controller = setupAuth({
    auth,
    root: document,
    redirectTo,
    now: () => time,
    schedule: () => null,
    onSession: async (session) => {
      sessions.push(session);
    },
  });
  $('#email').value = email;
  $('#password').value = password;
  return {
    $,
    calls,
    sessions,
    controller,
    advance: (milliseconds) => {
      time += milliseconds;
    },
    submit: () => $('#auth-form').onsubmit({ preventDefault() {} }),
    toggle: () => $('#auth-toggle').onclick(),
    resend: () => $('#resend').onclick(),
    forgot: () => $('#forgot').onclick(),
    emit: async (event, session) => {
      authEvent(event, session);
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

test('sign-up captures its mode, blocks duplicate requests and opens confirmation', async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const h = harness({ signUp: () => pending });
  h.toggle();
  const submission = h.submit();
  assert.equal(h.$('#auth-submit').disabled, true);
  assert.equal(h.$('#auth-toggle').disabled, true);
  assert.equal(h.$('#email').disabled, true);
  h.toggle();
  await h.submit();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0], {
    name: 'signUp',
    args: [{ email, password, options: { emailRedirectTo: redirectTo } }],
  });
  finish(success);
  await submission;
  assert.equal(h.$('#auth-title').textContent, 'Check your email.');
  assert.equal(h.$('#auth-form').hidden, true);
  assert.equal(h.$('#confirmation').hidden, false);
  assert.match(h.$('#auth-copy').textContent, /learner@example\.test/);
  assert.equal(h.$('#password').value, '');
  assert.equal(h.$('#auth-toggle').disabled, false);
  assert.equal(h.$('#resend').disabled, true);
  assert.deepEqual(h.sessions, []);
});

test('unconfirmed sign-in opens confirmation and resends with the deployed redirect', async () => {
  const h = harness({
    signInWithPassword: async () => ({
      data: { session: null },
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    }),
  });
  await h.submit();
  assert.equal(h.$('#confirmation').hidden, false);
  assert.match(h.$('#auth-message').textContent, /do not need to create it again/);
  assert.equal(h.$('#resend').disabled, false);
  await h.resend();
  assert.deepEqual(h.calls[1], {
    name: 'resend',
    args: [{ type: 'signup', email, options: { emailRedirectTo: redirectTo } }],
  });
  assert.equal(h.$('#resend').disabled, true);
  assert.match(h.$('#auth-message').textContent, /Use the newest email/);
});

test('successful sign-up cooldown prevents resends until time advances', async () => {
  const h = harness();
  h.toggle();
  await h.submit();
  await h.resend();
  assert.equal(h.calls.filter((call) => call.name === 'resend').length, 0);
  h.advance(59999);
  await h.resend();
  assert.equal(h.calls.filter((call) => call.name === 'resend').length, 0);
  h.advance(1);
  await h.resend();
  assert.equal(h.calls.filter((call) => call.name === 'resend').length, 1);
  assert.match(h.$('#resend').textContent, /60s/);
});

test('provider rate limit blocks resend for the requested interval and permits retry', async () => {
  const h = harness({
    signUp: async () => ({
      data: { session: null },
      error: {
        code: 'over_email_send_rate_limit',
        status: 429,
        message: 'For security purposes, you can only request this after 90 seconds.',
      },
    }),
  });
  h.toggle();
  await h.submit();
  assert.equal(h.$('#confirmation').hidden, false);
  assert.equal(h.$('#auth-message').dataset.kind, 'error');
  assert.match(h.$('#resend').textContent, /90s/);
  await h.resend();
  h.advance(89999);
  await h.resend();
  assert.equal(h.calls.filter((call) => call.name === 'resend').length, 0);
  h.advance(1);
  await h.resend();
  assert.equal(h.calls.filter((call) => call.name === 'resend').length, 1);
});

test('failed sign-up restores controls and can be retried', async () => {
  let attempts = 0;
  const h = harness({
    signUp: async () => {
      if (++attempts === 1) throw new Error('Network unavailable');
      return success;
    },
  });
  h.toggle();
  await h.submit();
  assert.equal(h.$('#auth-message').textContent, 'Network unavailable');
  for (const selector of ['#auth-submit', '#auth-toggle', '#email', '#password']) {
    assert.equal(h.$(selector).disabled, false, `${selector} must be enabled after failure`);
  }
  assert.equal(h.$('#auth-form').hidden, false);
  assert.equal(h.$('#password').value, password);
  await h.submit();
  assert.equal(attempts, 2);
  assert.equal(h.$('#confirmation').hidden, false);
});

test('password reset uses the deployed redirect and rejects blank email locally', async () => {
  const h = harness();
  h.$('#email').value = '';
  await h.forgot();
  assert.equal(h.calls.length, 0);
  assert.match(h.$('#auth-message').textContent, /valid email/);
  h.$('#email').value = email;
  await h.forgot();
  assert.deepEqual(h.calls, [{ name: 'resetPasswordForEmail', args: [email, { redirectTo }] }]);
  assert.equal(h.$('#forgot').disabled, false);
  assert.match(h.$('#auth-message').textContent, /reset email/);
});

test('recovery, password update and sign-out restore the sign-in interface', async () => {
  const session = { user: { id: 'test-user', email } };
  const h = harness({ getSession: async () => ({ data: { session }, error: null }) });
  await h.emit('PASSWORD_RECOVERY', session);
  assert.equal(h.$('#auth-title').textContent, 'Choose a new password.');
  assert.equal(h.$('#auth-submit').textContent, 'Update password');
  assert.equal(h.$('#auth-toggle').hidden, true);
  assert.equal(h.$('#forgot').hidden, true);
  assert.equal(h.$('#email').readOnly, true);
  assert.equal(h.$('#workspace').hidden, true);
  assert.equal(h.$('#auth').hidden, false);
  await h.emit('SIGNED_IN', session);
  assert.equal(h.sessions.length, 0, 'SIGNED_IN must not replace the recovery form');
  h.$('#password').value = 'A-new-test-password';
  await h.submit();
  assert.deepEqual(h.calls[0], { name: 'updateUser', args: [{ password: 'A-new-test-password' }] });
  assert.deepEqual(h.sessions, [session]);
  assert.equal(h.$('#auth-message').textContent, 'Password updated.');
  await h.emit('SIGNED_OUT', null);
  assert.deepEqual(h.sessions, [session, null]);
  assert.equal(h.$('#auth-title').textContent, 'Welcome back.');
  assert.equal(h.$('#auth-submit').textContent, 'Sign in');
  assert.equal(h.$('#auth-toggle').hidden, false);
  assert.equal(h.$('#forgot').hidden, false);
  assert.equal(h.$('#email').readOnly, false);
  assert.equal(h.$('#password').autocomplete, 'current-password');
  assert.equal(h.$('#password').value, '');
  h.toggle();
  assert.equal(h.$('#auth-submit').textContent, 'Create account');
});

test('a successful immediate session is delivered and expired links show an action', async () => {
  const session = { user: { id: 'test-user', email } };
  const h = harness({ signInWithPassword: async () => ({ data: { session }, error: null }) });
  await h.submit();
  assert.deepEqual(h.sessions, [session]);
  assert.equal(h.$('#password').value, '');
  h.controller.showLinkError();
  assert.match(h.$('#auth-message').textContent, /expired or is invalid/);
  assert.match(h.$('#auth-message').textContent, /fresh confirmation/);
});
