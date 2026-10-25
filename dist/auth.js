// Authentication UI is separate from application CRUD so every auth state can be tested.
export function setupAuth({
  auth,
  root = document,
  onSession,
  redirectTo,
  now = Date.now,
  schedule = setInterval,
}) {
  const $ = (selector) => root.querySelector(selector);
  let mode = 'signin',
    busy = false,
    pendingEmail = '',
    resendAt = 0;
  const form = $('#auth-form');
  const notice = root.createElement('p');
  notice.id = 'auth-message';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  form.before(notice);
  const confirmation = root.createElement('div');
  confirmation.id = 'confirmation';
  confirmation.hidden = true;
  const instructions = root.createElement('p');
  instructions.textContent =
    'Open the newest confirmation email and choose Confirm your email. Check your spam folder too. Then return here to sign in.';
  const resend = root.createElement('button');
  resend.type = 'button';
  resend.id = 'resend';
  resend.className = 'primary full';
  const hint = root.createElement('p');
  hint.className = 'confirmation-hint';
  hint.textContent =
    'If an older email opens localhost or an expired link, request a new email below. Use only the newest link.';
  confirmation.append(instructions, resend, hint);
  form.after(confirmation);
  const confirmationHelp = root.createElement('button');
  confirmationHelp.type = 'button';
  confirmationHelp.id = 'confirmation-help';
  confirmationHelp.className = 'text-button';
  confirmationHelp.textContent = 'Need to confirm your email?';
  $('#forgot').after(confirmationHelp);

  function message(text, error = false) {
    notice.textContent = text;
    notice.dataset.kind = error ? 'error' : 'info';
  }
  function render() {
    const confirming = mode === 'confirm',
      recovery = mode === 'recovery';
    $('#auth-title').textContent = {
      signin: 'Welcome back.',
      signup: 'Start your next chapter.',
      confirm: 'Check your email.',
      recovery: 'Choose a new password.',
    }[mode];
    $('#auth-copy').textContent = confirming
      ? `Confirmation is needed for ${pendingEmail}.`
      : recovery
        ? 'Set a new password for your account.'
        : mode === 'signup'
          ? 'Create an account, then confirm your email to sign in.'
          : 'Sign in to pick up where you left off.';
    form.hidden = confirming;
    confirmation.hidden = !confirming;
    $('#email').readOnly = recovery;
    $('#email').disabled = busy;
    $('#password').disabled = busy;
    $('#password').minLength = mode === 'signin' ? 1 : 8;
    $('#password').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
    $('#auth-submit').textContent = busy
      ? 'Please wait…'
      : recovery
        ? 'Update password'
        : mode === 'signup'
          ? 'Create account'
          : 'Sign in';
    $('#auth-submit').disabled = busy;
    $('#auth-toggle').hidden = recovery;
    $('#auth-toggle').disabled = busy;
    $('#auth-toggle').textContent = confirming
      ? 'Back to sign in'
      : mode === 'signup'
        ? 'Already have an account? Sign in'
        : 'New here? Create an account';
    $('#forgot').hidden = mode !== 'signin';
    $('#forgot').disabled = busy;
    confirmationHelp.hidden = confirming || recovery;
    confirmationHelp.disabled = busy;
    updateCooldown();
  }
  function updateCooldown() {
    const seconds = Math.max(0, Math.ceil((resendAt - now()) / 1000));
    resend.disabled = busy || seconds > 0;
    resend.textContent = seconds ? `Resend available in ${seconds}s` : 'Resend confirmation email';
  }
  function confirmEmail(email, text, cooldown = 0) {
    pendingEmail = email;
    mode = 'confirm';
    resendAt = Math.max(resendAt, now() + cooldown * 1000);
    $('#password').value = '';
    render();
    message(text);
  }
  function showError(error, email, action) {
    if (error.code === 'email_not_confirmed') {
      confirmEmail(
        email,
        'Your account is waiting for email confirmation. You do not need to create it again.',
      );
      return;
    }
    if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
      const seconds = Number(error.message?.match(/after (\d+) seconds/i)?.[1] || 60);
      resendAt = now() + seconds * 1000;
      if (action === 'signup' || action === 'resend')
        confirmEmail(
          email,
          'Too many email requests. Check for an existing confirmation email before requesting another.',
          seconds,
        );
      message(
        'Email requests are temporarily limited. Check your inbox and spam folder. If a later retry is still limited, wait before trying again.',
        true,
      );
    } else if (error.code === 'email_address_not_authorized') {
      message(
        'Email delivery is not enabled for this address yet. The app owner needs to configure an email provider before this address can sign up.',
        true,
      );
    } else if (error.code === 'user_already_exists' || error.code === 'email_exists') {
      mode = 'signin';
      message(
        'An account already exists for this email. Sign in or choose Forgot your password.',
        true,
      );
    } else if (error.code === 'invalid_credentials') {
      message('The email or password is incorrect. Try again or reset your password.', true);
    } else {
      message(error.message || 'Unable to connect. Please try again.', true);
    }
  }
  $('#auth-toggle').onclick = () => {
    if (busy) return;
    mode = mode === 'signin' ? 'signup' : 'signin';
    message('');
    render();
  };
  confirmationHelp.onclick = () => {
    if (busy) return;
    const email = $('#email').value.trim();
    if (!email || !$('#email').checkValidity()) {
      message('Enter your email address above to request a new confirmation link.', true);
      $('#email').focus();
      return;
    }
    confirmEmail(
      email,
      'Already signed up? Request a fresh confirmation email below. The new link returns to Careerlog.',
    );
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy || mode === 'confirm') return;
    const submittedMode = mode;
    const email = $('#email').value.trim(),
      password = $('#password').value;
    busy = true;
    message('');
    render();
    try {
      if (submittedMode === 'recovery') {
        const { error } = await auth.updateUser({ password });
        if (error) throw error;
        mode = 'signin';
        $('#password').value = '';
        const { data, error: sessionError } = await auth.getSession();
        if (sessionError) throw sessionError;
        await onSession(data.session);
        message('Password updated.');
      } else {
        const result =
          submittedMode === 'signup'
            ? await auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
            : await auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        $('#password').value = '';
        if (result.data.session) await onSession(result.data.session);
        else if (submittedMode === 'signup')
          confirmEmail(
            email,
            'Check your email for the next step. If you already have a confirmed account, return to sign in.',
            60,
          );
      }
    } catch (error) {
      showError(error, email, submittedMode);
    } finally {
      busy = false;
      render();
    }
  };
  resend.onclick = async () => {
    if (busy || now() < resendAt) return;
    busy = true;
    render();
    message('Requesting a new confirmation email…');
    try {
      const { error } = await auth.resend({
        type: 'signup',
        email: pendingEmail,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      resendAt = now() + 60000;
      message('Confirmation email requested. Use the newest email, then return here to sign in.');
    } catch (error) {
      showError(error, pendingEmail, 'resend');
    } finally {
      busy = false;
      render();
    }
  };
  $('#forgot').onclick = async () => {
    if (busy) return;
    const email = $('#email').value.trim();
    if (!email || !$('#email').checkValidity()) {
      message('Enter a valid email address above first.', true);
      $('#email').focus();
      return;
    }
    busy = true;
    render();
    try {
      const { error } = await auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      message('If an account exists, a reset email is on its way. Open the newest link.');
    } catch (error) {
      showError(error, email, 'reset');
    } finally {
      busy = false;
      render();
    }
  };
  auth.onAuthStateChange((event, session) => {
    // Avoid auth calls within the synchronous callback (the SDK holds a session lock).
    setTimeout(async () => {
      try {
        if (event === 'PASSWORD_RECOVERY') {
          mode = 'recovery';
          $('#email').value = session.user.email;
          $('#workspace').hidden = true;
          $('#add').hidden = true;
          $('#auth').hidden = false;
          message('');
          render();
        } else if (event === 'SIGNED_OUT') {
          mode = 'signin';
          pendingEmail = '';
          $('#password').value = '';
          message('');
          render();
          await onSession(null);
        } else if (['INITIAL_SESSION', 'SIGNED_IN'].includes(event) && mode !== 'recovery') {
          await onSession(session);
        }
      } catch (error) {
        message(error.message, true);
      }
    }, 0);
  });
  render();
  const timer = schedule(updateCooldown, 1000);
  return {
    showLinkError: () =>
      message(
        'This email link has expired or is invalid. Sign in to request a fresh confirmation, or use Forgot your password for a new reset link.',
        true,
      ),
    timer,
  };
}
