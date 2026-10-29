/* Bacha - Part 9: the admin "Feedback" tab, plus two small front-door touches for shop.html.
   This file ADDS to the admin hub without editing any of the older files:
     - a "Feedback" tab (rules, caption, coupons, approve / reject / hide / delete, coupon tracking)
     - the Bacha logo at the top of the shop now goes back to the new front page (index.html)
     - shop.html#staff opens the staff sign-in box (used by the "Staff login" link on the front page)
   Everything is saved through the feedback_* / admin_feedback_* functions from supabase_feedback.sql. */
(function () {
  const $ = id => document.getElementById(id);
  const q = (s, r) => (r || document).querySelector(s);

  // load this tab's own stylesheet (so css/tailwind.css never needs a rebuild)
  { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/feedback-admin.css'; document.head.appendChild(l); }

  // ---------------------------------------------------------------- state
  const S = { items: [], counts: { all: 0, pending: 0, approved: 0, rejected: 0, private: 0, avg: 0 }, cfg: null, filter: 'pending', search: '', loaded: false, busy: false };
  const money = n => '₱' + Number(n).toLocaleString('en-PH');
  const cLabel = c => c.kind === 'percent' ? Number(c.value) + '% off' : money(c.value) + ' off';
  const dt = iso => { try { return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const stars = n => `<span class="fba-stars" role="img" aria-label="${n} out of 5 stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
  const safeImg = u => /^https:\/\/[^\s"'<>]+$/.test(String(u || '')) ? u : '';
  const icons = () => { try { lucide.createIcons(); } catch (e) {} };

  // ---------------------------------------------------------------- inject the tab
  function inject() {
    const nav = q('#admin-sidebar .admin-nav'), content = q('#admin-view .admin-content');
    if (!nav || !content || $('tab-feedback-btn')) return;
    const b = document.createElement('button');
    b.id = 'tab-feedback-btn'; b.className = 'admin-tab'; b.setAttribute('onclick', "switchAdminTab('feedback')");
    b.innerHTML = '<i aria-hidden="true" data-lucide="star" class="w-[18px] h-[18px] shrink-0"></i><span class="admin-tab-label">Feedback</span><span id="fba-badge" class="admin-badge" hidden>0</span>';
    nav.appendChild(b);
    const p = document.createElement('div');
    p.id = 'admin-feedback-tab'; p.className = 'hidden space-y-4 fba'; p.innerHTML = '<div id="fba-body"></div>';
    content.appendChild(p);
    if (typeof TAB_KEYS !== 'undefined' && !TAB_KEYS.includes('feedback')) TAB_KEYS.push('feedback');   // keyboard arrows + screen-reader wiring
  }

  // ---------------------------------------------------------------- tab switching (wraps the existing function)
  const PANELS = ['today', 'inventory', 'orders', 'pos', 'cash', 'customize', 'deadline', 'records', 'settings'];
  const origSwitch = window.switchAdminTab;
  window.switchAdminTab = function (tab) {
    const panel = $('admin-feedback-tab'), btn = $('tab-feedback-btn');
    if (!panel || !btn) return origSwitch.apply(this, arguments);
    if (tab !== 'feedback') {
      panel.classList.add('hidden'); btn.className = 'admin-tab';
      return origSwitch.apply(this, arguments);
    }
    PANELS.forEach(t => { const v = $('admin-' + t + '-tab'), x = $('tab-' + t + '-btn'); if (v) v.classList.add('hidden'); if (x) x.className = 'admin-tab'; });
    panel.classList.remove('hidden'); btn.className = 'admin-tab is-active';
    activeAdminTab = 'feedback';
    if (typeof syncTabAria === 'function') syncTabAria('feedback');
    const ttl = $('admin-tab-title'); if (ttl) ttl.textContent = 'Feedback';
    if (typeof toggleAdminNav === 'function') toggleAdminNav(false);
    window.scrollTo(0, 0);
    if (typeof updatePosBar === 'function') updatePosBar();
    render(); load();
  };

  // little pending-count badge on the tab, refreshed whenever the admin hub opens
  const origView = window.switchView;
  window.switchView = function (view) {
    const r = origView.apply(this, arguments);
    if (view === 'admin') refreshBadge();
    return r;
  };
  async function refreshBadge() {
    if (typeof isAdminAuthenticated === 'undefined' || !isAdminAuthenticated || !$('fba-badge')) return;
    const { data } = await adm('admin_feedback_list', { p_status: 'pending', p_limit: 1 });
    if (data && data.counts) { S.counts = data.counts; paintBadge(); }
  }
  function paintBadge() { const b = $('fba-badge'); if (!b) return; b.textContent = S.counts.pending; b.hidden = !S.counts.pending; }

  // ---------------------------------------------------------------- data
  async function load() {
    if (S.busy) return; S.busy = true;
    const [l, s] = await Promise.all([adm('admin_feedback_list', { p_status: null, p_limit: 500 }), adm('admin_feedback_get_settings')]);
    S.busy = false;
    if (l.error || s.error) {
      const m = (l.error || s.error).message || '';
      S.err = /feedback|PGRST202|function|schema cache|404/i.test(m + JSON.stringify(l.error || s.error))
        ? 'The feedback tables are not set up in your database yet. Open the Supabase SQL editor and run supabase_feedback.sql once.' : m || 'Could not load feedback.';
      S.loaded = false; render(); return;
    }
    S.err = ''; S.items = l.data.items || []; S.counts = l.data.counts || S.counts; S.cfg = s.data; S.loaded = true;
    paintBadge(); render();
  }

  // ---------------------------------------------------------------- rendering
  const sel = (id, val, opts) => `<select id="${id}" class="fba-in">${opts.map(([v, t]) => `<option value="${v}"${String(v) === String(val) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  const starOpts = [[1, '1 star and up'], [2, '2 stars and up'], [3, '3 stars and up'], [4, '4 stars and up'], [5, '5 stars only']];
  const chk = (id, on, title, hint) => `<label class="fba-row" for="${id}"><input type="checkbox" id="${id}"${on ? ' checked' : ''}><span><b>${title}</b>${hint ? `<small>${hint}</small>` : ''}</span></label>`;

  function settingsHTML() {
    const c = S.cfg, k = c.coupon;
    return `<details class="fba-card" id="fba-settings"><summary><span class="fba-sum">⚙️ Rules, caption &amp; coupons</span></summary>
      <div class="fba-form">
        <div class="fba-grp"><h3>Feedback page</h3>
          ${chk('fba-accepting', c.accepting, 'Accept new feedback', 'Turn off to hide the form on the feedback page. The wall of approved feedback stays.')}
          <label class="fba-lbl" for="fba-caption">Caption shown under "Feedback"</label>
          <textarea id="fba-caption" class="fba-in" rows="2" maxlength="160">${esc(c.caption)}</textarea>
        </div>
        <div class="fba-grp"><h3>Which feedback is accepted</h3>
          <label class="fba-lbl" for="fba-minpub">Can be shown publicly at</label>
          ${sel('fba-minpub', c.min_stars_public, starOpts)}
          <small class="fba-hint">Lower ratings are not rejected. They are kept private so only you can read them.</small>
          ${chk('fba-auto', c.auto_approve, 'Publish automatically', 'Off = you approve each one first (recommended). On = anything at or above the rating above goes live straight away.')}
          ${chk('fba-photos', c.allow_photos, 'Allow photos (up to 2)', '')}
          <label class="fba-lbl" for="fba-minchars">Shortest message allowed (characters)</label>
          <input id="fba-minchars" class="fba-in fba-num" type="number" inputmode="numeric" min="0" max="200" value="${esc(c.min_chars)}">
        </div>
        <div class="fba-grp"><h3>Coupons for feedback</h3>
          ${chk('fba-c-on', k.enabled, 'Give coupons for feedback', 'When on, you can reward approved feedback with a one-time coupon code.')}
          <div id="fba-c-fields" class="${k.enabled ? '' : 'is-off'}">
            <div class="fba-two">
              <div><label class="fba-lbl" for="fba-c-kind">Coupon type</label>${sel('fba-c-kind', k.kind, [['percent', '% off'], ['amount', '₱ off']])}</div>
              <div><label class="fba-lbl" for="fba-c-value">Value</label><input id="fba-c-value" class="fba-in fba-num" type="number" inputmode="decimal" min="1" value="${esc(k.value)}"></div>
            </div>
            <div class="fba-two">
              <div><label class="fba-lbl" for="fba-c-days">Valid for (days)</label><input id="fba-c-days" class="fba-in fba-num" type="number" inputmode="numeric" min="1" max="365" value="${esc(k.days)}"></div>
              <div><label class="fba-lbl" for="fba-c-min">Qualifies at</label>${sel('fba-c-min', k.min_stars, starOpts)}</div>
            </div>
            ${chk('fba-c-photo', k.needs_photo, 'Only when the feedback has a photo', '')}
            ${chk('fba-c-auto', k.auto_issue, 'Give the coupon automatically', 'Only works together with "Publish automatically". Otherwise you choose "Approve + coupon" yourself.')}
            <label class="fba-lbl" for="fba-c-note">Note on the coupon <small>(optional, e.g. "Not valid with other promos")</small></label>
            <input id="fba-c-note" class="fba-in" maxlength="80" value="${esc(k.note)}">
            <p class="fba-hint">🎟️ Customers type the code in their bag at checkout. It takes the discount off and is marked used automatically (and given back if that order is rejected or cancelled). For in-store sales, when a customer shows a code, tap "Mark used" below.</p>
          </div>
        </div>
        <button type="button" class="fba-btn fba-btn--main" id="fba-save">Save feedback settings</button>
      </div></details>`;
  }

  function matches(f) {
    if (S.filter === 'hidden' ? !(f.status === 'private' || f.status === 'rejected') : (S.filter !== 'all' && f.status !== S.filter)) return false;
    const t = S.search.trim().toLowerCase(); if (!t) return true;
    return [f.name, f.contact, f.message, f.claim_code, f.coupon && f.coupon.code].some(x => String(x || '').toLowerCase().includes(t));
  }
  function couponState(c) {
    if (c.used_at) return ['used', 'Used ' + dt(c.used_at)];
    if (new Date(c.expires_at) < new Date()) return ['expired', 'Expired ' + dt(c.expires_at)];
    return ['active', 'Valid until ' + dt(c.expires_at)];
  }
  function itemHTML(f) {
    const k = S.cfg.coupon, can = k.enabled && !f.coupon;
    const qualifies = k.enabled && f.stars >= k.min_stars && (!k.needs_photo || f.photos.length);
    const b = (a, t, cls) => `<button type="button" class="fba-btn ${cls || ''}" data-a="${a}" data-id="${f.id}">${t}</button>`;
    let acts = '';
    if (f.status === 'pending' || f.status === 'private') acts += b('approve', 'Approve', 'fba-btn--main') + (can ? b('approve-coupon', 'Approve + coupon', 'fba-btn--berry') : '') + b('reject', 'Reject');
    if (f.status === 'pending') acts += b('private', 'Keep private');
    if (f.status === 'approved') acts += b('private', 'Unpublish') + (can ? b('coupon', 'Give coupon', 'fba-btn--berry') : '');
    if (f.status === 'rejected') acts += b('approve', 'Approve', 'fba-btn--main') + b('pending', 'Back to review');
    acts += b('delete', 'Delete', 'fba-btn--danger');
    const label = { pending: 'Waiting', approved: 'Published', private: 'Private', rejected: 'Rejected' }[f.status];
    let cp = '';
    if (f.coupon) {
      const [st, txt] = couponState(f.coupon);
      cp = `<div class="fba-coupon is-${st}"><div><b>🎟️ ${esc(f.coupon.code)}</b> · ${esc(cLabel(f.coupon))} <span class="fba-tag fba-tag--${st}">${st === 'active' ? 'Active' : st === 'used' ? 'Used' : 'Expired'}</span><small>${esc(txt)}</small></div>
        <div class="fba-cbtns"><button type="button" class="fba-btn" data-a="copy" data-code="${esc(f.coupon.code)}">Copy</button>
        <button type="button" class="fba-btn" data-a="${f.coupon.used_at ? 'unuse' : 'use'}" data-code="${esc(f.coupon.code)}">${f.coupon.used_at ? 'Mark unused' : 'Mark used'}</button>
        <button type="button" class="fba-btn fba-btn--danger" data-a="cancel" data-code="${esc(f.coupon.code)}">Cancel</button></div></div>`;
    }
    return `<article class="fba-item" data-id="${f.id}">
      <div class="fba-top">${stars(f.stars)} <span class="fba-tag fba-tag--${f.status}">${label}</span>${qualifies && !f.coupon ? '<span class="fba-tag fba-tag--ok">Qualifies for coupon</span>' : ''}<span class="fba-when">${esc(dt(f.created_at))}</span></div>
      ${f.message ? `<p class="fba-msg">${esc(f.message)}</p>` : ''}
      ${f.photos.length ? `<div class="fba-photos">${f.photos.map(safeImg).filter(Boolean).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img src="${esc(u)}" alt="Customer photo" loading="lazy"></a>`).join('')}</div>` : ''}
      <div class="fba-who"><b>${esc(f.name || 'No name')}</b>${f.contact ? ` · ${esc(f.contact)}` : ' · no contact left'} · <span class="fba-code">${esc(f.claim_code)}</span></div>
      ${cp}<div class="fba-acts">${acts}</div></article>`;
  }

  function listHTML() {
    const shown = S.items.filter(matches);
    if (!shown.length) return `<div class="fba-empty">${S.items.length ? 'Nothing matches here.' : 'No feedback yet. Share the link to your feedback page!'}</div>`;
    return shown.map(itemHTML).join('');
  }
  function tilesHTML() {
    const c = S.counts, hid = (c.private || 0) + (c.rejected || 0);
    return `<div class="fba-tiles"><div><b class="${c.pending ? 'hot' : ''}">${c.pending}</b><span>Waiting for you</span></div><div><b>${c.approved}</b><span>Published</span></div><div><b>${hid}</b><span>Private / rejected</span></div><div><b>${Number(c.avg || 0).toFixed(1)} ★</b><span>Average (${c.all})</span></div></div>`;
  }
  function chipsHTML() {
    const c = S.counts, hid = (c.private || 0) + (c.rejected || 0);
    const chip = (k, t, n) => `<button type="button" class="fba-chip${S.filter === k ? ' on' : ''}" data-f="${k}" aria-pressed="${S.filter === k}">${t} <span>${n}</span></button>`;
    return chip('pending', 'Waiting', c.pending) + chip('approved', 'Published', c.approved) + chip('hidden', 'Private / rejected', hid) + chip('all', 'All', c.all);
  }

  function render() {
    const body = $('fba-body'); if (!body) return;
    if (S.err) { body.innerHTML = `<div class="fba-card fba-err"><h3>Feedback needs one more step</h3><p>${esc(S.err)}</p><button type="button" class="fba-btn fba-btn--main" id="fba-retry">Try again</button></div>`; return; }
    if (!S.loaded) { body.innerHTML = '<div class="fba-empty">Loading feedback…</div>'; return; }
    // keep what the owner is typing in the settings box when the list refreshes
    const open = $('fba-settings') && $('fba-settings').open;
    if (!$('fba-list')) {
      body.innerHTML = `<div class="fba-card fba-head"><div><h2>Customer feedback</h2><p>Approve what goes on your public feedback page and reward good feedback with coupons.
        <a href="feedback.html" target="_blank" rel="noopener">Open feedback page ↗</a></p></div></div>
        <div id="fba-tiles"></div>${settingsHTML()}
        <div class="fba-card"><div class="fba-bar"><div class="fba-chips" id="fba-chips" role="group" aria-label="Filter feedback"></div>
        <label class="home-sr" for="fba-search">Search feedback</label><input id="fba-search" class="fba-in" type="search" placeholder="Search name, coupon code, words…" value="${esc(S.search)}"></div></div>
        <div id="fba-list" aria-live="polite"></div>`;
      if (open) $('fba-settings').open = true;
    }
    $('fba-tiles').innerHTML = tilesHTML(); $('fba-chips').innerHTML = chipsHTML(); $('fba-list').innerHTML = listHTML();
    const k = $('fba-c-on'); if (k) syncCouponFields();
    icons();
  }
  function syncCouponFields() { const on = $('fba-c-on').checked; $('fba-c-fields').classList.toggle('is-off', !on); $('fba-c-fields').querySelectorAll('input,select').forEach(x => x.disabled = !on); }

  // ---------------------------------------------------------------- actions
  async function saveSettings() {
    const btn = $('fba-save'); const num = id => Number($(id).value);
    const p = {
      accepting: $('fba-accepting').checked, caption: $('fba-caption').value.trim(), min_stars_public: num('fba-minpub'), auto_approve: $('fba-auto').checked,
      allow_photos: $('fba-photos').checked, min_chars: num('fba-minchars'),
      coupon: { enabled: $('fba-c-on').checked, kind: $('fba-c-kind').value, value: num('fba-c-value'), days: num('fba-c-days'), min_stars: num('fba-c-min'),
                needs_photo: $('fba-c-photo').checked, auto_issue: $('fba-c-auto').checked, note: $('fba-c-note').value.trim() }
    };
    if (!p.caption) { await showBachaAlert('Please write a short caption for the feedback page.', 'Caption needed', '✏️'); $('fba-caption').focus(); return; }
    if (p.coupon.kind === 'percent' && (p.coupon.value < 1 || p.coupon.value > 100)) { await showBachaAlert('A % coupon must be between 1 and 100.', 'Check the coupon', '🎟️'); return; }
    btn.disabled = true;
    const { data, error } = await adm('admin_feedback_save_settings', { p });
    btn.disabled = false;
    if (error) { await showBachaAlert(/bad_value/.test(error.message) ? 'Something in the settings is not allowed (for example a "<" or ">" in the caption, or a value out of range).' : error.message, 'Not saved', '⚠️'); return; }
    S.cfg = data; $('fba-list').innerHTML = listHTML();
    await showBachaAlert('Feedback settings saved.', 'Saved', '✓');
  }

  async function review(id, action, coupon) {
    const { data, error } = await adm('admin_feedback_review', { p_id: id, p_action: action, p_coupon: !!coupon });
    if (error) { await showBachaAlert(/coupons_off/.test(error.message) ? 'Coupons are switched off. Turn them on in the settings first.' : error.message, 'Could not update', '⚠️'); return; }
    await load();
    if (data && data.coupon && data.coupon.code) await showBachaAlert(`Coupon ${data.coupon.code} was created (${cLabel(data.coupon)}). It shows on the customer's feedback page. If they left contact details, you can also send it to them.`, 'Coupon created', '🎟️');
  }

  document.addEventListener('click', async e => {
    const root = $('admin-feedback-tab'); if (!root || !root.contains(e.target)) return;
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'fba-save') return saveSettings();
    if (t.id === 'fba-retry') return load();
    if (t.dataset.f) { S.filter = t.dataset.f; $('fba-chips').innerHTML = chipsHTML(); $('fba-list').innerHTML = listHTML(); return; }
    const a = t.dataset.a; if (!a) return;
    const id = Number(t.dataset.id), code = t.dataset.code;
    t.disabled = true;
    try {
      if (a === 'approve') await review(id, 'approve', false);
      else if (a === 'approve-coupon') await review(id, 'approve', true);
      else if (a === 'coupon') await review(id, 'approve', true);
      else if (a === 'reject') await review(id, 'reject', false);
      else if (a === 'private') await review(id, 'private', false);
      else if (a === 'pending') await review(id, 'pending', false);
      else if (a === 'delete') {
        if (await showBachaConfirm('Delete this feedback (and its coupon) for good? Photos stop showing too.', 'Delete feedback', '🗑️')) {
          const { error } = await adm('admin_feedback_delete', { p_id: id }); if (error) await showBachaAlert(error.message, 'Could not delete', '⚠️'); await load();
        }
      }
      else if (a === 'copy') { try { await navigator.clipboard.writeText(code); t.textContent = 'Copied ✓'; setTimeout(() => { t.textContent = 'Copy'; }, 1200); } catch (x) { t.textContent = code; } }
      else if (a === 'use' || a === 'unuse') { const { error } = await adm('admin_coupon_set_used', { p_code: code, p_used: a === 'use' }); if (error) await showBachaAlert(error.message, 'Could not update', '⚠️'); await load(); }
      else if (a === 'cancel') {
        if (await showBachaConfirm(`Cancel coupon ${code}? The customer will no longer see it.`, 'Cancel coupon', '🎟️')) {
          const { error } = await adm('admin_coupon_delete', { p_code: code }); if (error) await showBachaAlert(error.message, 'Could not cancel', '⚠️'); await load();
        }
      }
    } finally { if (t.isConnected) t.disabled = false; }
  });
  document.addEventListener('change', e => { if (e.target && e.target.id === 'fba-c-on') syncCouponFields(); });
  document.addEventListener('input', e => { if (e.target && e.target.id === 'fba-search') { S.search = e.target.value; $('fba-list').innerHTML = listHTML(); } });

  // ---------------------------------------------------------------- front-door touches for shop.html
  function wireHome() {
    const logo = q('header [aria-label="Bacha home"]');
    if (logo) {
      const go = "if(document.getElementById('admin-view').classList.contains('hidden')){location.href='index.html'}else{switchView('store')}";
      logo.setAttribute('onclick', go);
      logo.setAttribute('onkeydown', "if(event.key==='Enter'||event.key===' '){event.preventDefault();" + go + "}");
      logo.setAttribute('title', 'Back to the front page');
    }
    if (location.hash === '#staff') {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      const tryOpen = n => { if (typeof openAdminAccess === 'function' && !q('#bacha-preloader')) openAdminAccess(); else if (n < 40) setTimeout(() => tryOpen(n + 1), 150); };
      tryOpen(0);
    }
  }

  inject(); wireHome();
})();
