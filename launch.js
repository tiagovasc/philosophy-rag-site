/* Public launch behavior; no credentials or private backend state live here. */
(() => {
  let allowance = null;
  let lastRequest = null;
  try { lastRequest = JSON.parse(localStorage.getItem('philosophy-pending-submission')); } catch {}
  let reconnects = 0;
  let loadVersion = 0;
  const savedBusy = setBusy;
  const savedTab = switchTab;
  const savedShow = showResearch;

  function updateAllowance(value) {
    allowance = value;
    const paused = !value.research_enabled;
    $('allowance').textContent = paused ? 'Answers are paused · passage search is available' : `${value.answers} answer${value.answers === 1 ? '' : 's'} · ${value.searches} passage search${value.searches === 1 ? '' : 'es'} available today`;
    $('research-button').disabled = busy || paused || value.answers === 0;
    $('search-button').disabled = busy || value.searches === 0;
    const reset = new Date(value.resets_at);
    $('allowance').title = `Allowance resets ${reset.toLocaleString()}. Shared-network limits also apply.`;
  }

  async function refreshAllowance() {
    try { updateAllowance(await api('/api/limits')); }
    catch { $('allowance').textContent = 'Daily allowance is temporarily unavailable.'; }
  }

  api = async function(path, body) {
    const headers = {'X-Research-Owner': libraryToken, ...await window.PhilosophyAuth.headers()};
    if (body) {
      body = {...body, model: 'gpt-6.1-sol', effort: 'low', website: $('website-check').value};
      const bytes = new TextEncoder().encode(JSON.stringify(body));
      const key = (window.PhilosophyAuth.signedIn() ? 'account:' : 'guest:') + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
      if (!lastRequest || lastRequest.key !== key || Date.now() - lastRequest.at > 600000) {
        lastRequest = {key, id: crypto.randomUUID().replaceAll('-', ''), at: Date.now()};
        localStorage.setItem('philosophy-pending-submission', JSON.stringify(lastRequest));
      }
      body.request_id = lastRequest.id;
      headers['Content-Type'] = 'application/json';
    }
    let response;
    try {
      response = await fetch(API_BASE + path, {method: body ? 'POST' : 'GET', headers, ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(20000)});
    } catch {
      throw new Error(body ? 'The connection was interrupted. Your inquiry may still be running; check your saved inquiries before starting again.' : 'The connection was interrupted. Reopen this saved item to try again.');
    }
    const isJSON = response.headers.get('Content-Type')?.includes('application/json');
    const result = isJSON ? await response.json() : {};
    if (!response.ok) {
      let message = result.error || 'The research room is temporarily unavailable. Please try shortly.';
      if (result.retry_after_seconds && result.retry_after_seconds < 3600) message += ` Try again in ${Math.max(1, Math.ceil(result.retry_after_seconds / 60))} minute(s).`;
      throw new Error(message);
    }
    if (result.usage) updateAllowance({...result.usage, research_enabled: allowance?.research_enabled ?? true});
    if (body) {
      localStorage.setItem('philosophy-last-inquiry', result.id);
      lastRequest = null;
      localStorage.removeItem('philosophy-pending-submission');
    }
    return result;
  };

  setBusy = function(value) {
    savedBusy(value);
    $('new-research').disabled = value;
    $('research-button').setAttribute('aria-busy', String(value));
    if (allowance) updateAllowance(allowance);
  };

  showResearch = function(record) {
    savedShow(record);
    $('download-answer').hidden = !record.answer;
    if (record.evidence_limit) {
      const note = nodes('p', 'Answers use up to 10 whole matching passages, keeping the evidence focused. All retrieved passages remain available.');
      $('method-view').append(note);
    }
  };

  load = async function(id) {
    clearTimeout(polling);
    const version = ++loadVersion;
    localStorage.setItem('philosophy-last-inquiry', id);
    try {
      const record = await api('/api/jobs/' + encodeURIComponent(id));
      if (version !== loadVersion) return;
      const changed = !current || current.id !== record.id;
      current = record;
      if (changed) {
        tab = record.mode === 'search' ? 'passages' : 'answer';
        $('question').value = record.question;
        populateOptions({...record.options, rag_count: Math.min(30, record.options.rag_count), answer_count: Math.min(10, record.options.answer_count, record.options.rag_count), model: 'gpt-6.1-sol', effort: 'low'});
        $('rating-filter').value = 'all';
      }
      $('question-count').textContent = `${$('question').value.length.toLocaleString()} / 1,200`;
      reconnects = 0;
      showResearch(record);
      const running = ['running', 'queued'].includes(record.status);
      setBusy(running);
      if (running) polling = setTimeout(() => load(id), document.hidden ? 10000 : 2000);
      else { await loadLibrary(); await refreshAllowance(); }
    } catch (error) {
      if (version !== loadVersion) return;
      alertMessage(error.message);
      if (reconnects++ < 3) {
        setBusy(true);
        polling = setTimeout(() => load(id), 5000 * reconnects);
      } else {
        setBusy(false);
        await refreshAllowance();
      }
    }
    if (!busy && current?.status === 'done') {
      reconnects = 0;
    }
  };

  switchTab = function(value) {
    savedTab(value);
    ['answer', 'passages', 'method'].forEach(name => $(name + '-tab').tabIndex = name === value ? 0 : -1);
  };
  ['answer', 'passages', 'method'].forEach((name, index, names) => {
    const button = $(name + '-tab'), panel = $(name + '-view');
    button.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % names.length;
      if (event.key === 'ArrowLeft') next = (index + names.length - 1) % names.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = names.length - 1;
      if (next !== undefined) { event.preventDefault(); switchTab(names[next]); $(names[next] + '-tab').focus(); }
    });
  });
  switchTab('answer');

  $('question').addEventListener('input', () => {
    $('question-count').textContent = `${$('question').value.length.toLocaleString()} / 1,200`;
  });
  $('new-research').addEventListener('click', () => {
    if (!busy) { ++loadVersion; localStorage.removeItem('philosophy-last-inquiry'); localStorage.removeItem('philosophy-pending-submission'); lastRequest = null; $('question-count').textContent = '0 / 1,200'; }
  });
  $('privacy-button').addEventListener('click', () => $('privacy-dialog').showModal());
  $('close-privacy').addEventListener('click', () => $('privacy-dialog').close());
  $('download-answer').addEventListener('click', () => {
    if (!current?.answer) return;
    const entries = new Map((current.sources || []).map(row => [row.doc_id, row]));
    const links = [...entries.values()].map(row => `- ${row.title} — ${row.authors || 'Author not recorded'}: ${row.url}`).join('\n');
    const content = `# ${current.question}\n\n${current.options.corpus_tag} snapshot · ${new Date(current.created_at).toISOString().slice(0, 10)}\n\n${current.answer}\n\n## Original entries\n\n${links}\n`;
    const url = URL.createObjectURL(new Blob([content], {type: 'text/markdown;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'philosophy-inquiry.md'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  window.addEventListener('online', () => {
    refreshAllowance();
    if (current && ['running', 'queued'].includes(current.status) && reconnects++ < 3) load(current.id);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshAllowance();
  });
  window.addEventListener('philosophy-account-change', () => {
    // Account changes invalidate in-flight reads and remove private rendered content.
    ++loadVersion;
    window.PHILOSOPHY_IDENTITY_VERSION = (window.PHILOSOPHY_IDENTITY_VERSION || 0) + 1;
    libraryToken = localStorage.getItem('philosophy-library') || libraryToken;
    clearTimeout(polling);
    current = null;
    setBusy(false);
    $('research').hidden = true;
    $('welcome').hidden = false;
    $('suggestions').hidden = false;
    $('question').value = '';
    $('source-dialog').close();
    $('source-content').replaceChildren();
    $('library').replaceChildren();
    ['answer', 'passages', 'method-view', 'sources', 'result-question'].forEach(id => $(id).replaceChildren());
    localStorage.removeItem('philosophy-last-inquiry');
    localStorage.removeItem('philosophy-pending-submission');
    lastRequest = null;
    loadLibrary();
    refreshAllowance();
  });
  refreshAllowance();
  // Loading a saved inquiry never starts a new provider request.
  const previous = localStorage.getItem('philosophy-last-inquiry');
  if (previous && /^[a-f0-9]{32}$/.test(previous)) load(previous);
})();
