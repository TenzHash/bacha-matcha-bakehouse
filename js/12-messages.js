/* One-tap customer messages: SMS opens the phone's messaging app with the text already written */

function orderMessage(o) {
  const first = String(o.customer_name || '').trim().split(/\s+/)[0] || 'there';
  const id = o.id, total = '₱' + Number(o.total_amount || 0);
  const batch = o.batch_date && !/Counter|In-Store/i.test(o.batch_date) ? ' for ' + String(o.batch_date).replace('Batch: ', '') : '';
  const k = orderKind(o), delivery = o.fulfillment === 'delivery';
  const hi = `Hi ${first}! This is Bacha Matcha & Bakehouse 🍪 `;
  if (k === 'pending') return hi + `We received your order ${id} (${total}). We're checking it now and will confirm shortly. Thank you!`;
  if (k === 'queued') return hi + `Your order ${id}${batch} is confirmed and in the oven. Total ${total}${o.payment_method === 'COD' ? ' (cash on delivery)' : ''}. We'll message you when it's ready!`;
  if (k === 'ready') return hi + (delivery ? `Your order ${id} is ready and will be on its way to you shortly. Total ${total}${o.payment_method === 'COD' ? ', please prepare the exact amount' : ''}.` : `Your order ${id} is ready for pick-up! Let us know when you're on your way.`);
  if (k === 'done') return hi + `Thank you for ordering (${id})! We hope you enjoy your treats. We'd love to hear what you think 💚`;
  return hi + `Your order ${id} was cancelled${o.status_note && /24 hours/.test(o.status_note) ? " because we couldn't confirm it within 24 hours" : ''}. If you have any questions, just reply here. Sorry for the trouble!`;
}
function msgOrder(id) { return orders.find(x => x.id === id); }
function textCustomer(id) {
  const o = msgOrder(id); if (!o) return;
  const num = normalizePH(o.contact_number); if (!num) { toast('This order has no valid phone number'); return; }
  const sep = /iPhone|iPad|Mac/i.test(navigator.userAgent) ? '&' : '?';
  window.location.href = `sms:${num}${sep}body=${encodeURIComponent(orderMessage(o))}`;
}
async function copyCustomerMessage(id) {
  const o = msgOrder(id); if (!o) return;
  const text = orderMessage(o);
  try { await navigator.clipboard.writeText(text); toast('Message copied. Paste it in Messenger / Viber'); }
  catch (e) { await showBachaAlert(text, 'Copy this message', '💬'); }
}
function messageButtons(o) {
  if (o.order_type === 'pos') return '';
  const cls = 'px-2.5 py-1 rounded-lg bg-white hover:bg-bacha-matchaLight border border-bacha-matcha text-bacha-matchaDark font-cute text-sm font-bold';
  return `<div class="pt-2 flex flex-wrap items-center gap-2">
    <button onclick="textCustomer(this.dataset.id)" data-id="${esc(o.id)}" class="${cls}">💬 Text customer</button>
    <button onclick="copyCustomerMessage(this.dataset.id)" data-id="${esc(o.id)}" class="${cls}">📋 Copy message</button>
  </div>`;
}
