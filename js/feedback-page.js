/* Bacha - Part 9: feedback page. Talks to the database only through the feedback_* functions (see supabase_feedback.sql). */
(function () {
  const $ = id => document.getElementById(id);
  const sb = Home.sb(), esc = Home.esc;
  const CLAIMS_KEY = 'bacha_fb_claims';
  const WORDS = ['', 'Oh no 😕', 'Could be better', 'It was okay', 'Really good!', 'Loved it! 💚'];
  let cfg = { accepting: true, caption: '', allow_photos: true, min_chars: 3, coupon: { enabled: false } };
  let stars = 0, photos = [], sending = false, unavailable = false;

  const starSVG = off => `<svg viewBox="0 0 24 24" aria-hidden="true"${off ? ' class="off"' : ''}><path d="M12 2.4l2.95 6.1 6.65.9-4.85 4.7 1.2 6.6L12 17.4l-5.95 3.3 1.2-6.6L2.4 9.4l6.65-.9z"/></svg>`;
  const starRow = n => `<span class="st" role="img" aria-label="${n} out of 5 stars">${[1, 2, 3, 4, 5].map(i => i <= n ? starSVG(false) : starSVG(true)).join('')}</span>`;

  function readClaims() { try { const a = JSON.parse(localStorage.getItem(CLAIMS_KEY) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, 5) : []; } catch (e) { return []; } }
  function saveClaim(code) { try { const a = [code, ...readClaims().filter(c => c !== code)].slice(0, 5); localStorage.setItem(CLAIMS_KEY, JSON.stringify(a)); } catch (e) {} }

  function err(msg) {
    const e = $('fb-error');
    e.textContent = msg || ''; e.hidden = !msg;
  }
  function niceError(m) {
    m = String(m || '');
    const map = {
      feedback_closed: "We're not collecting feedback right now. Please check back soon!",
      bad_stars: 'Please tap a star rating from 1 to 5.',
      bad_message: `Please write a little more (at least ${cfg.min_chars || 3} characters, up to 600).`,
      bad_name: 'Your name or contact is too long.',
      too_many_photos: 'You can add up to 2 photos.',
      bad_photo: 'One of the photos was not accepted. Please pick it again.',
      photos_off: "Photos aren't being accepted right now. Please remove them and try again.",
      too_many_requests: 'Lots of feedback is coming in at once! Please try again in a few minutes.',
      try_again: 'Something hiccuped. Please press send again.'
    };
    for (const k in map) if (m.includes(k)) return map[k];
    return 'Sorry, we could not send that. Please check your connection and try again.';
  }

  // ---------------------------------------------------------------- rating
  function buildStars() {
    $('fb-stars').innerHTML = [1, 2, 3, 4, 5].map(i =>
      `<input type="radio" name="fb-rate" id="fb-r${i}" value="${i}"><label for="fb-r${i}" data-i="${i}" title="${i} star${i > 1 ? 's' : ''}"><span class="home-sr">${i} star${i > 1 ? 's' : ''}</span>${starSVG(false)}</label>`).join('') +
      '<span class="fb-stars-word" id="fb-stars-word" aria-live="polite"></span>';
    const labels = [...document.querySelectorAll('#fb-stars label')];
    const paint = n => { labels.forEach((l, k) => l.classList.toggle('on', k < n)); $('fb-stars-word').textContent = WORDS[n] || ''; };
    $('fb-stars').addEventListener('change', e => { if (e.target.name === 'fb-rate') { stars = +e.target.value; paint(stars); err(''); } });
    labels.forEach(l => {
      l.addEventListener('mouseenter', () => paint(+l.dataset.i));
      l.addEventListener('mouseleave', () => paint(stars));
    });
    $('fb-stars').dataset.paint = '1';
    window.__paintStars = paint;
  }

  // ---------------------------------------------------------------- photos
  function drawPhotos() {
    const box = $('fb-photos');
    box.innerHTML = photos.map((p, i) => `<div class="fb-thumb"><img src="${p.url}" alt="Your photo ${i + 1}"><button type="button" data-rm="${i}" aria-label="Remove photo ${i + 1}">×</button></div>`).join('') +
      (photos.length < 2 ? `<button type="button" class="fb-add" id="fb-add-photo" aria-label="Add a photo"><b aria-hidden="true">＋</b>Add photo</button>` : '');
  }
  function checkImg(f) {
    if (!/^image\/(jpeg|png|webp)$/i.test(f.type)) return 'Please use a JPG, PNG or WebP photo. (HEIC is not supported.)';
    if (f.size > 15 * 1024 * 1024) return 'That photo is bigger than 15 MB. Please pick a smaller one.';
    return '';
  }
  async function shrink(file, max) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
      if (blob && blob.size < 5 * 1024 * 1024) return blob;
    } catch (e) {}
    return file.size < 5 * 1024 * 1024 ? file : null;
  }
  async function uploadPhoto(file) {
    const blob = await shrink(file, 1400);
    if (!blob) throw new Error('bad_photo');
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const name = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('') + '.' + ext;
    const { error } = await sb.storage.from('feedback-photos').upload(name, blob, { contentType: blob.type || 'image/jpeg' });
    if (error) throw error;
    return sb.storage.from('feedback-photos').getPublicUrl(name).data.publicUrl;
  }

  // ---------------------------------------------------------------- config + wall
  const perkText = c => {
    const k = c.coupon; if (!k || !k.enabled) return '';
    const bits = [`${k.min_stars}★ or more`]; if (k.needs_photo) bits.push('with a photo');
    return `🎟️ Share ${bits.join(' ')} and we may send you ${Home.couponLabel(k)} for your next order (valid ${k.days} days after approval).${k.note ? ' ' + k.note : ''}`;
  };
  function applyConfig() {
    $('fb-caption').textContent = cfg.caption || 'Tell us how we did - we read every single one.';
    const perk = perkText(cfg); $('fb-perk').hidden = !perk; $('fb-perk').textContent = perk;
    $('fb-photo-field').hidden = !cfg.allow_photos;
    const closed = !cfg.accepting || unavailable;
    $('fb-form').hidden = closed || !$('fb-thanks').hidden; $('fb-closed').hidden = !closed;
    if (unavailable) $('fb-closed').innerHTML = '<div style="font-size:2rem" aria-hidden="true">🛠️</div><p style="margin:6px 0 0"><b>Feedback isn\'t available just yet.</b><br>Please try again a little later.</p>';
    $('fb-add-yours').hidden = closed; $('fb-float').hidden = true;
    $('fb-msg').setAttribute('placeholder', 'What did you order? What did you love, or what could be better?');
  }
  async function loadConfig() {
    if (!sb) { unavailable = true; applyConfig(); return; }
    const { data, error } = await sb.rpc('feedback_config');
    if (error || !data) { if (error && /feedback_config|PGRST202|404/.test(JSON.stringify(error))) unavailable = true; applyConfig(); return; }
    cfg = Object.assign(cfg, data); applyConfig();
  }
  async function loadWall() {
    const wall = $('fb-wall');
    if (!sb) { wall.innerHTML = ''; return; }
    const { data, error } = await sb.rpc('feedback_wall', { p_limit: 40 });
    if (error || !Array.isArray(data)) { wall.innerHTML = '<div class="fb-empty">We couldn\'t load the feedback wall just now.</div>'; return; }
    if (!data.length) { wall.style.columns = '1'; wall.innerHTML = `<div class="fb-empty"><div style="font-size:2rem" aria-hidden="true">🍵</div><p style="margin:6px 0 0"><b>Be the first!</b><br>Your feedback will show up here once we've read it.</p></div>`; return; }
    wall.style.columns = '';
    wall.innerHTML = data.map(f => {
      const imgs = (f.photos || []).filter(u => /^https:\/\//.test(u));
      return `<article class="fb-item">${starRow(+f.stars)}
        ${f.message ? `<p>${esc(f.message)}</p>` : ''}
        ${imgs.length ? `<div class="fb-imgs">${imgs.map(u => `<button type="button" data-zoom="${esc(u)}" aria-label="View photo full size"><img src="${esc(u)}" alt="Photo shared by ${esc(f.name)}" loading="lazy"></button>`).join('')}</div>` : ''}
        <div class="by">${esc(f.name)} · ${esc(Home.when(f.at))}</div></article>`;
    }).join('');
  }

  // ---------------------------------------------------------------- my feedback (this device)
  const pill = s => `<span class="fb-pill fb-pill--${esc(s)}">${s === 'approved' ? 'Published' : s === 'rejected' ? 'Not published' : 'In review'}</span>`;
  function couponBox(c, small) {
    if (!c) return '';
    const exp = c.expires_at ? Home.when(c.expires_at) : '';
    return `<div class="fb-ticket"><div class="t">🎟️ Your coupon</div><div class="v">${esc(Home.couponLabel(c))}</div>
      <div class="fb-code" style="margin:6px 0"><span>${esc(c.code)}</span><button type="button" data-copy="${esc(c.code)}">Copy</button></div>
      <small>${c.used ? 'This coupon has been used.' : `Enter this code in your bag when you order${exp ? ' · valid until ' + esc(exp) : ''}.`}</small></div>`;
  }
  async function loadMine() {
    const codes = readClaims(); const wrap = $('fb-mine-wrap');
    if (!codes.length || !sb) { wrap.hidden = true; return; }
    const res = await Promise.all(codes.map(async c => { const { data } = await sb.rpc('feedback_status', { p_code: c }); return data && data.found ? Object.assign({ code: c }, data) : null; }));
    const list = res.filter(Boolean);
    if (!list.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    $('fb-mine').innerHTML = list.map(f => `<li>${starRow(+f.stars)} ${pill(f.status)}
      <div style="margin:6px 0 2px;overflow-wrap:anywhere">${esc(String(f.message).slice(0, 140))}${String(f.message).length > 140 ? '…' : ''}</div>
      <div style="font-size:.75rem;color:rgba(74,62,61,.75)">Your code: <b style="font-family:ui-monospace,monospace">${esc(f.code)}</b></div>${couponBox(f.coupon)}</li>`).join('');
  }

  // ---------------------------------------------------------------- send
  function resetForm() {
    stars = 0; photos.forEach(p => URL.revokeObjectURL(p.url)); photos = [];
    $('fb-msg').value = ''; $('fb-count').textContent = '0'; $('fb-hp').value = '';
    document.querySelectorAll('input[name=fb-rate]').forEach(r => r.checked = false); window.__paintStars(0);
    drawPhotos(); err('');
  }
  async function send(e) {
    e.preventDefault(); if (sending) return;
    err('');
    const msg = $('fb-msg').value.trim();
    if (!stars) { err('Please tap a star rating first.'); document.getElementById('fb-r1').focus(); return; }
    if (msg.length < (cfg.min_chars || 0)) { err(`Please write a little more (at least ${cfg.min_chars} characters).`); $('fb-msg').focus(); return; }
    if (!sb) { err('Feedback is not available right now.'); return; }
    sending = true; const btn = $('fb-send'); btn.disabled = true; btn.textContent = photos.length ? 'Uploading photos…' : 'Sending…';
    try {
      const urls = [];
      for (const p of photos) urls.push(await uploadPhoto(p.file));
      btn.textContent = 'Sending…';
      const { data, error } = await sb.rpc('submit_feedback', { p: { stars, message: msg, name: $('fb-name').value, contact: $('fb-contact').value, photos: urls, hp: $('fb-hp').value } });
      if (error) throw error;
      saveClaim(data.claim_code);
      showThanks(data);
      resetForm(); $('fb-name').value = ''; $('fb-contact').value = '';
      loadWall(); loadMine();
    } catch (ex) {
      err(niceError(ex && (ex.message || ex)));
    } finally { sending = false; btn.disabled = false; btn.textContent = 'Send feedback'; }
  }
  function showThanks(d) {
    const t = $('fb-thanks');
    const line = d.status === 'approved' ? "It's already up on our feedback wall below. Thank you!"
      : d.status === 'private' ? 'We read every note, the honest ones most of all, and we will use it to get better.'
      : "We'll read it soon and it may appear on our feedback wall.";
    const maybe = !d.coupon && cfg.coupon && cfg.coupon.enabled && d.status !== 'private' ? `<p class="fb-fine">If it earns a coupon, you'll find it right here on this page. Keep the code below.</p>` : '';
    t.innerHTML = `<div class="big" aria-hidden="true">💚</div><h2 id="fb-thanks-h">Thank you!</h2><p style="margin:4px 0 0">${esc(line)}</p>
      ${couponBox(d.coupon)}
      <p class="fb-fine" style="margin-top:14px">Your private feedback code (we saved it on this device):</p>
      <div class="fb-code"><span>${esc(d.claim_code)}</span><button type="button" data-copy="${esc(d.claim_code)}">Copy</button></div>${maybe}
      <div style="margin-top:14px"><button type="button" class="fb-btn fb-btn--ghost" id="fb-another">Add another</button></div>`;
    t.hidden = false; $('fb-form').hidden = true; t.focus({ preventScroll: false });
    t.scrollIntoView({ block: 'center' });
  }
  function backToForm(focus) {
    $('fb-thanks').hidden = true; $('fb-form').hidden = !cfg.accepting || unavailable;
    if (focus) { $('fb-form-card').scrollIntoView({ block: 'start' }); setTimeout(() => (document.getElementById('fb-r1') || $('fb-msg')).focus({ preventScroll: true }), 250); }
  }

  // ---------------------------------------------------------------- wiring
  let releaseBox = null;
  function zoom(u) {
    const box = $('fb-lightbox'); $('fb-lightbox-img').src = u; box.hidden = false;
    releaseBox = Home.trapFocus(box, closeZoom); $('fb-lightbox-x').focus();
  }
  function closeZoom() { $('fb-lightbox').hidden = true; $('fb-lightbox-img').removeAttribute('src'); if (releaseBox) { releaseBox(); releaseBox = null; } }

  document.addEventListener('click', async e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.rm != null) { const i = +t.dataset.rm; URL.revokeObjectURL(photos[i].url); photos.splice(i, 1); drawPhotos(); const a = $('fb-add-photo'); if (a) a.focus(); }
    else if (t.id === 'fb-add-photo') $('fb-file').click();
    else if (t.dataset.zoom) zoom(t.dataset.zoom);
    else if (t.dataset.copy) { try { await navigator.clipboard.writeText(t.dataset.copy); const o = t.textContent; t.textContent = 'Copied ✓'; setTimeout(() => t.textContent = o, 1500); } catch (x) { t.textContent = 'Select & copy'; } }
    else if (t.id === 'fb-add-yours' || t.id === 'fb-float') backToForm(true);
    else if (t.id === 'fb-another') backToForm(true);
    else if (t.id === 'fb-lightbox-x') closeZoom();
  });
  $('fb-lightbox').addEventListener('mousedown', e => { if (e.target === $('fb-lightbox')) closeZoom(); });
  $('fb-file').addEventListener('change', e => {
    err('');
    const room = 2 - photos.length, files = [...e.target.files];
    for (const f of files.slice(0, room)) { const m = checkImg(f); if (m) { err(m); continue; } photos.push({ file: f, url: URL.createObjectURL(f) }); }
    if (files.length > room) err('You can add up to 2 photos. We kept the first ones.');
    e.target.value = ''; drawPhotos();
  });
  $('fb-msg').addEventListener('input', () => { $('fb-count').textContent = $('fb-msg').value.length; });
  $('fb-form').addEventListener('submit', send);

  // the floating "Add yours" button appears when the form is out of view
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => { $('fb-float').hidden = en.isIntersecting || $('fb-add-yours').hidden; }, { threshold: 0.05 }).observe($('fb-form-card'));
  }

  buildStars(); drawPhotos();
  loadConfig().then(() => { loadWall(); loadMine(); });
})();
