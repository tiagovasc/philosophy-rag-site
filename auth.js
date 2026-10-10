/* Google OAuth uses Supabase PKCE; the server verifies every account identity. */
(() => {
  let client = null;
  let session = null;
  let config = null;
  let initializing = true;
  let problem = null;
  const el = id => document.getElementById(id);
  const key = 'philosophy-auth-v1';
  const message = value => { el('auth-message').textContent = value; };
  const cleanCallback = () => {
    const url = new URL(location.href);
    ['code', 'error', 'error_description', 'error_code'].forEach(name => url.searchParams.delete(name));
    url.hash = '';
    history.replaceState(null, '', url.pathname + url.search);
  };
  function render() {
    el('google-signin').hidden = !!session;
    el('google-signin').disabled = initializing || !config?.enabled;
    el('signout').hidden = !session;
    // Profile text is informational only; it never supplies an authorization ID.
    el('account-label').textContent = session ? 'Signed in · ' + (session.user?.user_metadata?.full_name || 'Google account') : 'Explore as a guest, or save across devices.';
    el('library-location').textContent = session ? 'Saved to your Google account' : 'Saved to this browser’s library';
    el('claim-library-row').hidden = !!session;
    el('auth-disabled').hidden = !!config?.enabled;
  }
  const ready = (async () => {
    try {
      const response = await fetch(window.PHILOSOPHY_API_URL + '/api/auth/config', {signal: AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error();
      config = await response.json();
      if (!config.enabled) return;
      if (config.url !== 'https://zajrrynbnitxwxytkpmw.supabase.co' || !config.publishable_key?.startsWith('sb_publishable_')) throw new Error();
      client = new window.PhilosophySupabase.GoTrueClient({
        url: config.url + '/auth/v1', headers: {apikey: config.publishable_key},
        storageKey: key, flowType: 'pkce', persistSession: true,
        autoRefreshToken: true, detectSessionInUrl: true,
      });
      const result = await client.getSession();
      if (result.error) throw new Error('Sign-in could not finish. Please try Google sign-in again.');
      session = result.data.session;
      const hadCallback = new URL(location.href).searchParams.has('code');
      const hadError = new URL(location.href).searchParams.has('error');
      if (hadCallback || hadError || location.hash) cleanCallback();
      if (hadError) message('Google sign-in was cancelled or could not finish. You can try again.');
      if (session && localStorage.getItem('philosophy-link-library') === 'yes') {
        const guest = localStorage.getItem('philosophy-library');
        if (guest && /^[a-f0-9]{32}$/.test(guest)) {
          const claim = await fetch(window.PHILOSOPHY_API_URL + '/api/auth/claim', {
            method: 'POST', headers: {'Authorization': 'Bearer ' + session.access_token, 'X-Research-Owner': guest},
            signal: AbortSignal.timeout(15000),
          });
          if (!claim.ok) {
            message('Signed in. This browser’s earlier library could not be linked; its original records are preserved.');
            localStorage.removeItem('philosophy-last-inquiry');
          } else {
            message('Signed in. Your saved inquiries are now available across devices.');
            // Another account must never inherit the linked guest capability.
            localStorage.setItem('philosophy-library', crypto.randomUUID().replaceAll('-', ''));
            localStorage.removeItem('philosophy-guest-last-inquiry');
          }
        }
        localStorage.removeItem('philosophy-link-library');
      }
      if (session && localStorage.getItem('philosophy-link-library') === 'no') {
        localStorage.removeItem('philosophy-last-inquiry');
        localStorage.removeItem('philosophy-link-library');
      }
      client.onAuthStateChange((_event, value) => {
        const previous = session?.user?.id;
        session = value;
        render();
        if (previous !== session?.user?.id) {
          setTimeout(() => window.dispatchEvent(new CustomEvent('philosophy-account-change')), 0);
        }
      });
    } catch (error) {
      cleanCallback();
      problem = client ? 'Sign-in could not finish. Please sign in again.' : null;
      message(client ? 'Sign-in could not finish. Please try Google sign-in again.' : 'Google sign-in is temporarily unavailable. Guest inquiries are still available.');
    } finally { initializing = false; render(); }
  })();
  window.PhilosophyAuth = {
    ready,
    signedIn: () => !!session,
    async headers() {
      await ready;
      if (problem) throw new Error(problem);
      if (!client) return {};
      const {data, error} = await client.getSession();
      if (error) throw new Error('Your sign-in needs reconnecting. Please sign in with Google again.');
      session = data.session;
      return session ? {Authorization: 'Bearer ' + session.access_token} : {};
    },
  };
  el('google-signin').addEventListener('click', async () => {
    await ready;
    if (!client) return;
    el('google-signin').disabled = true;
    message('Opening Google sign-in…');
    try {
      const here = location.origin + location.pathname.replace(/index\.html$/, '');
      if (!config.redirects.includes(here)) throw new Error('Open the published Philosophy website to sign in.');
      const previous = localStorage.getItem('philosophy-last-inquiry');
      if (previous) localStorage.setItem('philosophy-guest-last-inquiry', previous);
      localStorage.setItem('philosophy-link-library', el('claim-library').checked ? 'yes' : 'no');
      const {error} = await client.signInWithOAuth({provider: 'google', options: {redirectTo: here, scopes: 'openid email profile', queryParams: {prompt: 'select_account'}}});
      if (error) throw new Error('Google sign-in could not start. Please try again.');
    } catch (error) { message(error.message); el('google-signin').disabled = false; }
  });
  el('signout').addEventListener('click', async () => {
    el('signout').disabled = true;
    const {error} = await client.signOut({scope: 'local'});
    if (error) { message('Sign-out could not finish. Please try again.'); el('signout').disabled = false; return; }
    session = null;
    // Clear only Philosophy state; other apps hosted on this origin keep their data.
    ['philosophy-last-inquiry', 'philosophy-pending-submission', 'philosophy-link-library'].forEach(name => localStorage.removeItem(name));
    const guestPrevious = localStorage.getItem('philosophy-guest-last-inquiry');
    if (guestPrevious && /^[a-f0-9]{32}$/.test(guestPrevious)) localStorage.setItem('philosophy-last-inquiry', guestPrevious);
    location.reload();
  });
})();
