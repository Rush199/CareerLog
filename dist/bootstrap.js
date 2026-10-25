const form = document.querySelector('#auth-form');
// Prevent a native form submission if the application module cannot load.
const blockSubmission = (event) => event.preventDefault();
form.addEventListener('submit', blockSubmission);
document.querySelector('#auth-submit').disabled = true;
try {
  await import('./app.js');
  form.removeEventListener('submit', blockSubmission);
} catch {
  const notice = document.querySelector('#message');
  notice.textContent =
    'The app could not connect to its sign-in service. Check your connection and reload this page.';
  notice.setAttribute('role', 'alert');
  const retry = document.createElement('button');
  retry.className = 'text-button';
  retry.type = 'button';
  retry.textContent = 'Reload sign-in';
  retry.onclick = () => location.reload();
  notice.append(retry);
}
