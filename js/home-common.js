/* Bacha - Part 9: tiny helpers shared by the front page (index.html) and the feedback page (feedback.html).
   If you ever move to another Supabase project, change the two lines below AND the same two lines at the top of js/01-core.js. */
const HOME_SB_URL = "https://awclyrlqxcnjbxjlnqxr.supabase.co";
const HOME_SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3Y2x5cmxxeGNuamJ4amxucXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NzQzODIsImV4cCI6MjEwODE1MDM4Mn0.8iOG3BG2_8AApscVO9qmmMrIrtVPXxEGfuGxUM4wGYo";

const Home = (() => {
  let client = null;
  try { if (window.supabase && HOME_SB_URL) client = window.supabase.createClient(HOME_SB_URL, HOME_SB_KEY); } catch (e) { console.error('Supabase init failed', e); }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PLATFORMS = [['Instagram', '📸'], ['Facebook', '👍'], ['TikTok', '🎵'], ['Messenger', '💬'], ['X (Twitter)', '🐦'], ['YouTube', '▶️'], ['Website', '🌐'], ['Other', '🔗']];
  const icon = n => { const f = PLATFORMS.find(p => p[0].toLowerCase() === String(n).toLowerCase()); return f ? f[1] : '🔗'; };
  // only plain web links are ever turned into a clickable address
  function safeUrl(u) { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } }
  function pretty(u) { try { const x = new URL(u); return (x.host + x.pathname).replace(/^www\./, '').replace(/\/$/, ''); } catch (e) { return u; } }

  // social links = the ones the admin saves in Store control -> "Payments, delivery & socials"
  function cachedSocials() {
    try { const o = JSON.parse(localStorage.getItem('bacha_site_opts') || 'null'); if (o && Array.isArray(o.socials)) return o.socials; } catch (e) {}
    return null;
  }
  async function loadSocials() {
    if (!client) return cachedSocials() || [];
    try {
      const { data, error } = await client.from('store_settings').select('value').eq('key', 'site_options').maybeSingle();
      if (error) throw error;
      const o = data && data.value ? JSON.parse(data.value) : {};
      const list = Array.isArray(o.socials) ? o.socials : [];
      try { const prev = JSON.parse(localStorage.getItem('bacha_site_opts') || '{}') || {}; prev.socials = list; localStorage.setItem('bacha_site_opts', JSON.stringify(prev)); } catch (e) {}
      return list;
    } catch (e) { return cachedSocials() || []; }
  }

  const money = n => '₱' + Number(n).toLocaleString('en-PH');
  const couponLabel = c => c.kind === 'percent' ? Number(c.value) + '% off' : money(c.value) + ' off';
  function when(iso) { try { return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return ''; } }

  // keeps keyboard focus inside a pop-up and gives it back when it closes
  function trapFocus(box, onClose) {
    const prev = document.activeElement;
    const sel = 'a[href],button:not([disabled]),input:not([disabled]),textarea,select,[tabindex]:not([tabindex="-1"])';
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const f = [...box.querySelectorAll(sel)].filter(x => x.offsetParent !== null || x === document.activeElement);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (prev && prev.focus) try { prev.focus(); } catch (e) {} };
  }

  return { sb: () => client, esc, icon, safeUrl, pretty, loadSocials, cachedSocials, money, couponLabel, when, trapFocus };
})();
