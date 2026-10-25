import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { SUPABASE_URL, SUPABASE_KEY, AUTH_REDIRECT_URL } from './config.js';
import { setupAuth } from './auth.js';
import { createRepository } from './repository.js';
import { setupWorkspace } from './workspace.js';

const linkError =
  new URLSearchParams(location.hash.slice(1)).has('error') ||
  new URLSearchParams(location.search).has('error');
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const workspace = setupWorkspace({
  repository: createRepository(db),
  signOut: async () => {
    const { error } = await db.auth.signOut();
    if (error) throw error;
  },
});
const authUI = setupAuth({
  auth: db.auth,
  onSession: workspace.showSession,
  redirectTo: AUTH_REDIRECT_URL,
});
if (linkError) {
  authUI.showLinkError();
  history.replaceState(null, '', location.pathname);
}
