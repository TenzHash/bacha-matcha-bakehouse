/* Box builder, cookie picker, cart, checkout */
function renderBoxBuilder(newlyAddedIndex = null) {
  const slotsContainer = document.getElementById('box-slots-container');
  const countIndicator = document.getElementById('box-slot-indicator');
  const totalDisplay = document.getElementById('box-total-price');
  const addBtn = document.getElementById('add-box-btn');

  let slotsHTML = '';
  let boxTotal = 0;

  for (let i = 0; i < 6; i++) {
    const item = customBox[i];
    if (item) {
      boxTotal += item.price;
      slotsHTML += `
        <div id="slot-node-${i}" class="relative w-[78px] h-[78px] sm:w-[96px] sm:h-[96px] md:w-[116px] md:h-[116px] lg:w-[104px] lg:h-[104px] xl:w-[104px] xl:h-[104px] max-h-full flex items-center justify-center">
          <button onclick="removeFromBox(${i})" title="Remove ${esc(item.name)}" aria-label="Remove ${esc(item.name)} from box" class="absolute -top-1 -right-1 no-tap hit w-7 h-7 bg-rose-600 hover:bg-rose-700 hover:scale-110 active:scale-95 text-white rounded-full flex items-center justify-center text-[12px] font-bold shadow-md z-20 transition">
            ✕
          </button>
          <div class="w-full h-full rounded-full p-1 bg-white border-2 border-bacha-strawberry/50 shadow-md flex items-center justify-center overflow-hidden slot-pop donut-cookie-shadow">
            <img src="${esc(item.image)}" alt="${esc(item.name)}" class="w-full h-full rounded-full object-cover select-none pointer-events-none" onerror="this.src='images/classic.png';" />
          </div>
        </div>
      `;
    } else {
      slotsHTML += `
        <div id="slot-node-${i}" class="relative flex items-center justify-center">
          <button onclick="openFlavorPicker()" aria-label="Choose a cookie for spot ${i + 1}" class="slot-add w-full h-full rounded-full border-2 border-dashed border-bacha-strawberry/60 bg-white/70 flex items-center justify-center">
            <span aria-hidden="true" class="font-cute text-3xl font-bold text-bacha-strawberry/70 select-none">+</span>
          </button>
        </div>
      `;
    }
  }

  slotsContainer.innerHTML = slotsHTML;
  countIndicator.innerText = `${customBox.length} / 6 Selected`;
  totalDisplay.innerText = `₱${boxTotal}`;

  if (newlyAddedIndex !== null) {
    const slotEl = document.getElementById(`slot-node-${newlyAddedIndex}`);
    if (slotEl) triggerSmokePuff(slotEl);
  }

  if (customBox.length === 6) {
    addBtn.disabled = false;
    addBtn.className = "px-3.5 sm:px-4 py-1.5 rounded-xl text-[13px] sm:text-sm font-cute font-bold bg-bacha-berry hover:bg-bacha-berryDark text-white cursor-pointer transition shadow-sm";
  } else {
    addBtn.disabled = true;
    addBtn.className = "px-3.5 sm:px-4 py-1.5 rounded-xl text-[13px] sm:text-sm font-cute font-bold bg-gray-200 text-gray-600 cursor-not-allowed transition shadow-sm";
  }

  renderFlavorPicker();
  renderSingleMenu();
  renderPOS();
  applyStoreMode();
  updateMobileBar();
}

async function addToBox(id) {
  if (customBox.length >= 6) return;
  const prod = products.find(p => p.id === id);
  if (!prod || prod.stock <= 0) return;

  const currentlyInBox = customBox.filter(item => item.id === id).length;
  if (currentlyInBox >= prod.stock) {
    await showBachaAlert(`Only ${prod.stock} available in oven for ${prod.name}!`, "Oven Capacity Reached", "🍪");
    return;
  }

  const targetIndex = customBox.length;
  customBox.push({ ...prod });
  renderBoxBuilder(targetIndex);
  if (customBox.length >= 6) toggleFlavorPicker(false);
}

function removeFromBox(index) { customBox.splice(index, 1); renderBoxBuilder(); }
function clearBox() { customBox = []; renderBoxBuilder(); }

function addCustomBoxToCart() {
  if (customBox.length !== 6) return;
  if (appConfig.maxBoxes > 0 && cart.filter(c => c.kind !== 'single').length >= appConfig.maxBoxes) {
    showBachaAlert(`To keep every order fresh, we can take up to ${appConfig.maxBoxes} boxes per order.`, "Box Limit", "📦"); return;
  }
  const boxTotal = customBox.reduce((sum, item) => sum + item.price, 0);

  cart.push({
    boxId: 'box-' + Date.now(),
    name: 'Custom Box of 6',
    batchDate: selectedBatchDate || "Weekly Drop Batch",
    items: [...customBox],
    price: boxTotal
  });

  customBox = [];
  renderBoxBuilder();
  updateCartUI();
  toggleCartDrawer(true);
}

function removeBoxFromCart(boxId) { cart = cart.filter(b => b.boxId !== boxId); updateCartUI(); renderSingleMenu(); }

function usedInCart(id) {
  return cart.reduce((n, c) => n + (c.kind === 'single' ? (c.prodId === id ? c.qty : 0) : c.items.filter(i => i.id === id).length), 0);
}

function addSingleToCart(id) {
  const prod = products.find(p => p.id === id);
  if (!prod || prod.stock - usedInCart(id) <= 0) return;
  if (catOf(prod) === 'Drinks' && drinkAllowance() <= 0) { showBachaAlert(drinkLimitMsg(), "Drink Limit", "🍵"); return; }
  const ex = cart.find(c => c.kind === 'single' && c.prodId === id);
  if (ex) { ex.qty++; ex.price = ex.unit * ex.qty; }
  else cart.push({ kind: 'single', boxId: 's-' + id, prodId: id, name: prod.name, image: prod.image, unit: prod.price, qty: 1, price: prod.price });
  updateCartUI(); renderSingleMenu();
}

function changeSingleQty(id, delta) {
  const ex = cart.find(c => c.kind === 'single' && c.prodId === id);
  const prod = products.find(p => p.id === id);
  if (!ex || !prod) return;
  if (delta > 0 && prod.stock - usedInCart(id) <= 0) return;
  if (delta > 0 && catOf(prod) === 'Drinks' && drinkAllowance() <= 0) { showBachaAlert(drinkLimitMsg(), "Drink Limit", "🍵"); return; }
  ex.qty += delta;
  if (ex.qty <= 0) cart = cart.filter(c => c !== ex); else ex.price = ex.unit * ex.qty;
  updateCartUI(); renderSingleMenu();
}

function updateCartUI() {
  const container = document.getElementById('cart-items-container');
  let boxNo = 0;
  if (cart.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-sm text-bacha-text/75 font-cute"><span class="text-3xl block mb-1">📦</span>Your bag is empty.</div>`;
  } else {
    container.innerHTML = cart.map(c => {
      if (c.kind === 'single') return `
        <div class="p-2 rounded-xl bg-bacha-matchaLight/50 border border-bacha-gingham text-sm flex items-center gap-2">
          <img src="${esc(c.image)}" alt="" class="w-9 h-9 rounded-full object-cover shrink-0" onerror="this.src='images/classic.png';" />
          <div class="flex-1 min-w-0">
            <p class="font-cute font-bold text-[13px] text-bacha-berry truncate">${esc(c.name)}</p>
            <p class="text-[12px] text-bacha-text/75">₱${c.unit} each</p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button onclick="changeSingleQty(${c.prodId}, -1)" aria-label="Decrease ${esc(c.name)}" class="qty-btn w-6 h-6 rounded border border-bacha-gingham bg-white font-bold">-</button>
            <span class="w-5 text-center font-bold">${c.qty}</span>
            <button onclick="changeSingleQty(${c.prodId}, 1)" aria-label="Increase ${esc(c.name)}" class="qty-btn w-6 h-6 rounded border border-bacha-gingham bg-white font-bold text-bacha-matcha">+</button>
          </div>
          <span class="font-cute font-bold text-bacha-matcha w-12 text-right">₱${c.price}</span>
        </div>`;
      boxNo++;
      return `
        <div class="p-2.5 sm:p-3 rounded-xl bg-bacha-pinkLight/80 border border-bacha-strawberry/35 text-sm relative">
          <div class="flex justify-between items-start">
            <div>
              <p class="font-cute font-bold text-bacha-berry text-sm">Box #${boxNo} (6 pcs)</p>
              <p class="text-[12px] font-bold text-bacha-matchaDark">${esc(c.batchDate)}</p>
              <p class="text-bacha-matcha font-bold">₱${c.price}</p>
            </div>
            <button onclick="removeBoxFromCart('${c.boxId}')" aria-label="Remove box from bag" class="no-tap hit text-bacha-text/75 hover:text-rose-700 font-bold p-2 text-sm"><span aria-hidden="true">✕</span></button>
          </div>
          <div class="mt-1.5 text-[12px] text-bacha-text/75 bg-white/90 p-2 rounded-lg border border-bacha-gingham space-y-1">
            ${c.items.map(item => `<div class="flex items-center gap-1.5"><img src="${esc(item.image)}" alt="${esc(item.name)}" class="w-4 h-4 rounded-full object-cover shrink-0" onerror="this.src='images/classic.png';" /><span>• ${esc(item.name)} (₱${item.price})</span></div>`).join('')}
          </div>
        </div>`;
    }).join('');
  }
  document.getElementById('cart-counter').innerText = cart.reduce((n, c) => n + (c.kind === 'single' ? c.qty : 1), 0);
  document.getElementById('cart-total-price').innerText = `₱${cart.reduce((t, c) => t + c.price, 0)}`;
  updateMobileBar();
}

function toggleCartDrawer(open) {
  const drawer = document.getElementById('cart-drawer');
  const panel = document.getElementById('cart-panel');
  if (open) {
    drawer.classList.remove('pointer-events-none', 'opacity-0');
    drawer.classList.add('opacity-100');
    panel.classList.remove('translate-x-full');
  } else {
    drawer.classList.add('pointer-events-none', 'opacity-0');
    drawer.classList.remove('opacity-100');
    panel.classList.add('translate-x-full');
  }
}



async function submitCustomerOrder() {
  const nameInput = document.getElementById('cust-name');
  const contactInput = document.getElementById('cust-contact');
  const fileInput = document.getElementById('cust-receipt-file');
  const noteInput = document.getElementById('cust-note');
  const submitBtn = document.getElementById('submit-order-btn');
  const name = nameInput.value.trim(), contact = contactInput.value.trim(), note = noteInput.value.trim();
  const receiptFile = fileInput.files[0];

  if (storeMode !== 'open' || isSoldOut()) { await showBachaAlert("The bakery is currently not accepting orders. Please check back soon!", "Shop Closed", "🌙"); return; }
  if (cart.length === 0) { await showBachaAlert("Your bag is empty. Add a Box of 6 or some items first!", "Empty Bag", "📦"); return; }
  clearFieldErrs();
  const isDelivery = fulfillment === 'delivery', isCOD = isDelivery && payMethod === 'COD';
  const addressInput = document.getElementById('cust-address');
  const mapsInput = window.L ? document.getElementById('pin-map') : document.getElementById('cust-maps');
  const address = addressInput.value.trim(), mapsLink = (window.L ? document.getElementById('pin-link') : document.getElementById('cust-maps')).value.trim();
  if (!name) { fieldErr(nameInput, "Please enter the recipient's full name."); return; }
  if (!contact) { fieldErr(contactInput, "Please enter your mobile / GCash number."); return; }
  const phone = normalizePH(contact);
  if (!phone) { fieldErr(contactInput, "Please enter a valid Philippine mobile number, like 0917 123 4567."); return; }
  if (isDelivery && !address) { fieldErr(addressInput, "Please enter your delivery address or landmarks."); return; }
  if (isDelivery && !/^https?:\/\//i.test(mapsLink)) { fieldErr(mapsInput, window.L ? "Please drop your delivery pin on the map (tap the map or use your current location)." : "Paste your Google Maps pin link (it starts with https://)."); return; }
  const rules = deliveryRules(), areaOk = document.getElementById('cust-area-ok');
  if (isDelivery && rules.area && !areaOk.checked) { fieldErr(document.getElementById('area-ok-label'), "Please confirm your address is inside our delivery area."); areaOk.focus(); return; }
  if (!note) { fieldErr(noteInput, "Please tell us your preferred pick-up / delivery time."); return; }
  if (!isCOD && !receiptFile) { fieldErr(fileInput, "Please upload your GCash payment screenshot."); return; }
  if (!isCOD) { const imgMsg = checkImageFile(receiptFile); if (imgMsg) { fieldErr(fileInput, imgMsg); return; } }

  const deductions = {}, orderBoxes = [], orderItems = [];
  let grandTotal = 0;
  cart.forEach(c => {
    grandTotal += c.price;
    if (c.kind === 'single') {
      deductions[c.prodId] = (deductions[c.prodId] || 0) + c.qty;
      orderItems.push({ id: c.prodId, name: c.name, category: catOf(products.find(x => x.id === c.prodId) || {}), qty: c.qty, unit_price: c.unit });
    } else {
      c.items.forEach(i => { deductions[i.id] = (deductions[i.id] || 0) + 1; });
      orderBoxes.push({ name: c.name, batchDate: c.batchDate, price: c.price, items: c.items.map(i => i.name), item_ids: c.items.map(i => i.id) });
    }
  });
  const closedBox = orderBoxes.find(b => !(batchCutoffs[b.batchDate] > Date.now()));
  if (closedBox) {
    await showBachaAlert(`The bake date "${String(closedBox.batchDate).replace('Batch: ', '')}" is no longer open for orders (the cut-off has passed).\n\nPlease remove that box from your bag and build it again with a new bake date.`, "Cut-Off Passed", "⏳");
    return;
  }
  if (isDelivery && rules.min > 0 && grandTotal < rules.min) { fieldErr(addressInput, `Delivery is free for orders of ₱${rules.min} or more. Add a few more items, or choose pick-up.`); return; }
  for (const [pid, cnt] of Object.entries(deductions)) {
    const p = products.find(x => x.id == pid);
    if (!p || p.stock < cnt) {
      await showBachaAlert(`Sorry, "${p ? p.name : 'an item'}" no longer has enough stock. Please adjust your bag.`, "Stock Changed", "🍪");
      return;
    }
  }

  const drinksInOrder = orderItems.filter(i => i.category === 'Drinks').reduce((n, i) => n + i.qty, 0);
  if (appConfig.dailyDrinks > 0 && drinksSoldToday() + drinksInOrder > appConfig.dailyDrinks) {
    await showBachaAlert("Sorry, we've reached today's drink limit. Please reduce the drinks in your bag.", "Drink Limit", "🍵");
    return;
  }
  submitBtn.disabled = true;
  submitBtn.innerText = isCOD ? "Placing Order..." : "Uploading Receipt...";
  const resetBtn = () => { submitBtn.disabled = false; updateCheckoutUI(); };

  let receiptUrl = null;
  if (!isCOD) {
    receiptUrl = await uploadImage(receiptFile, 'receipt');
    if (!receiptUrl) {
      await showBachaAlert("Receipt upload failed. Please make sure your file is a valid JPG/PNG image.", "Upload Error", "⚠️");
      resetBtn(); return;
    }
  }

  const prefix = orderBoxes.length ? 'BOX' : 'ORD';
  const newOrder = {
    customer_name: name,
    contact_number: phone,
    gcash_ref: null,
    receipt_url: receiptUrl,
    notes: note,
    batch_date: orderBoxes.length ? orderBoxes[0].batchDate : 'Counter Pick-up / Ala-Carte',
    boxes: orderBoxes,
    items: orderItems,
    order_type: 'online',
    payment_method: isCOD ? 'COD' : 'GCash',
    fulfillment: fulfillment,
    delivery_address: isDelivery ? address : null,
    maps_link: isDelivery ? mapsLink : null,
    total_amount: grandTotal,
    status: isCOD ? COD_STATUS : "Payment Verification Required"
  };

  let placedId = null;
  if (SB()) {
    submitBtn.innerText = "Placing your order...";
    const payload = {
      name, contact: phone, notes: note, fulfillment, payment_method: isCOD ? 'COD' : 'GCash',
      delivery_address: isDelivery ? address : null, maps_link: isDelivery ? mapsLink : null, receipt_url: receiptUrl,
      boxes: orderBoxes.map(b => ({ batchDate: b.batchDate, item_ids: b.item_ids })),
      items: orderItems.map(i => ({ id: i.id, qty: i.qty }))
    };
    const { data, error } = await sbClient.rpc('place_order', { p: payload });
    if (error || !data || !data.id) {
      resetBtn();
      await showBachaAlert(friendlyErr(error && error.message), "Order Not Placed", "❌");
      await initSupabaseData(); renderBoxBuilder();
      return;
    }
    placedId = data.id;
    newOrder.id = placedId;
  } else {
    submitBtn.innerText = "Reserving your order...";
    const rs = await reserveStock(deductions);
    if (!rs.ok) {
      resetBtn();
      await showBachaAlert(rs.reason === 'short' ? `Sorry, "${rs.name}" just ran out of stock. Please adjust your bag.` : `We couldn't reserve your items: ${(rs.error && rs.error.message) || 'please try again'}`, "Stock Changed", "🍪");
      renderBoxBuilder();
      return;
    }
    do { newOrder.id = makeOrderId(prefix); } while (orders.some(o => o.id === newOrder.id));
    orders.unshift({ ...newOrder, created_at: new Date().toISOString() });
  }

  cart = [];
  nameInput.value = ""; contactInput.value = ""; fileInput.value = ""; noteInput.value = "";
  document.getElementById('cust-address').value = ""; document.getElementById('cust-maps').value = ""; if (typeof resetPin === 'function') resetPin(); document.getElementById('cust-area-ok').checked = false;
  fulfillment = 'pickup'; payMethod = 'GCash';
  resetBtn();
  saveState();
  updateCartUI();
  toggleCartDrawer(false);
  renderBoxBuilder();
  renderAdmin();

  try { localStorage.setItem('bacha_last_order', JSON.stringify({ id: newOrder.id, contact: phone })); } catch (e) {}
  showOrderSuccess(newOrder.id, isCOD);
}



// ---- cookie picker popup ----
function toggleFlavorPicker(open) {
  const m = document.getElementById('flavor-picker-modal');
  if (!m) return;
  m.classList.toggle('opacity-0', !open); m.classList.toggle('pointer-events-none', !open);
  m.classList.toggle('opacity-100', open); m.classList.toggle('pointer-events-auto', open);
  if (open) renderFlavorPicker();
}
function openFlavorPicker() { if (customBox.length < 6) toggleFlavorPicker(true); }
function renderFlavorPicker() {
  const grid = document.getElementById('picker-grid'), cnt = document.getElementById('picker-count');
  if (!grid) return;
  if (cnt) cnt.textContent = `${customBox.length} / 6 in your box`;
  const list = boxProducts();
  if (!list.length) { grid.innerHTML = '<p class="text-sm text-bacha-text/80 col-span-full py-6 text-center font-cute">No cookies are available right now.</p>'; return; }
  grid.innerHTML = list.map(prod => {
    const inBox = customBox.filter(i => i.id === prod.id).length;
    const left = prod.stock - inBox, out = left <= 0, full = customBox.length >= 6;
    const dis = out || full;
    return `
      <button onclick="addToBox(${prod.id})" ${dis ? 'disabled' : ''} aria-label="Add ${esc(prod.name)}, ${out ? 'sold out' : left + ' left'}" class="picker-card ${out ? 'is-out' : ''}">
        ${prod.promo_tag ? `<span class="picker-tag">${esc(prod.promo_tag)}</span>` : ''}
        ${inBox ? `<span class="picker-in">×${inBox} in box</span>` : ''}
        <img src="${esc(prod.image)}" alt="" class="picker-img" onerror="this.src='images/classic.png';" />
        <span class="picker-name font-cute">${esc(prod.name)}</span>
        <span class="picker-meta"><b class="font-cute">₱${prod.price}</b><span class="${out ? 'text-rose-700' : left <= lowStockLimit() ? 'text-amber-700' : ''}">${out ? 'Sold out' : left + ' left'}</span></span>
      </button>`;
  }).join('');
}
