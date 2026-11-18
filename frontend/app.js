// ==================================================================
// Frontend: screens only. All business logic lives in the backend (/api).
// ==================================================================
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => Number(n).toFixed(2);

let session = null;            // { token, name, role }
let products = [], timer;
const TABS = { products: "Products", sell: "Sell", history: "History & Undo", restock: "Restock" };
const isAdmin = () => session && session.role === "Admin";

// ---------- API helper ----------
async function api(method, path, body) {
  const res = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json", ...(session ? { Authorization: "Bearer " + session.token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && session) doLogout();
    throw new Error(data.error || "Something went wrong");
  }
  return data;
}

// ---------- helpers ----------
function toast(text, ok = true) {
  const m = $("msg");
  m.textContent = text; m.style.background = ok ? "#16a34a" : "#dc2626"; m.style.display = "block";
  clearTimeout(timer); timer = setTimeout(() => m.style.display = "none", 3000);
}
async function guard(action) {          // run an action: show errors nicely, then redraw
  try { await action(); await refresh(); }
  catch (e) { toast(e.message, false); }
}

// ---------- login / tabs ----------
async function doLogin() {
  try {
    session = await api("POST", "/login", { username: $("user").value.trim(), password: $("pass").value });
  } catch (e) { return toast(e.message, false); }
  $("loginBox").hidden = true; $("app").hidden = false; $("logoutBtn").hidden = false;
  $("who").textContent = `${session.name} (${session.role})`;
  const names = isAdmin() ? Object.keys(TABS) : ["products", "sell"];   // role decides the menu
  $("tabs").innerHTML = names.map(n => `<button class="light" id="t_${n}" onclick="openTab('${n}')">${TABS[n]}</button>`).join("");
  await refresh(); openTab("products");
}
async function doLogout() {
  if (session) { try { await api("POST", "/logout"); } catch (e) {} }
  session = null; $("pass").value = "";
  $("loginBox").hidden = false; $("app").hidden = true; $("logoutBtn").hidden = true; $("who").textContent = "";
}
function openTab(name) {
  Object.keys(TABS).forEach(n => { $(n).hidden = n !== name; const b = $("t_" + n); if (b) b.classList.toggle("on", n === name); });
}
async function refresh() {
  products = await api("GET", "/products");
  showProducts(); fillSellList();
  document.querySelectorAll(".adminOnly").forEach(e => e.hidden = !isAdmin());
  if (isAdmin()) { await Promise.all([showHistory(), showRestock()]); }
}

// ---------- products ----------
function showProducts() {
  const q = $("search").value.toLowerCase(), by = $("sort").value, admin = isAdmin();
  const list = products.filter(p => p.name.toLowerCase().includes(q))
    .sort((a, b) => by === "name" ? a.name.localeCompare(b.name) : a[by] - b[by]);
  $("prodTable").innerHTML = `<tr><th>ID</th><th>Name</th><th>Type</th><th>Price</th><th>Qty</th><th>Details</th>${admin ? "<th></th>" : ""}</tr>` +
    list.map(p => `<tr><td>${p.id}</td><td>${esc(p.name)}</td><td>${p.type}</td><td>${money(p.price)}</td><td>${p.qty}</td>
      <td>${esc(p.extra)} ${p.low ? '<span class="tag low">LOW</span>' : ""} ${p.expired ? '<span class="tag exp">EXPIRED</span>' : ""}</td>
      ${admin ? `<td><button class="red" onclick="doDelete(${p.id})">Delete</button></td>` : ""}</tr>`).join("");
}
function typeChanged() {
  const t = $("ptype").value;
  $("pexp").hidden = !(t === "P" || t === "F");
  $("pbrand").hidden = !(t === "B" || t === "F");
}
function doAdd() {
  guard(async () => {
    await api("POST", "/products", {
      type: $("ptype").value, name: $("pname").value, price: $("pprice").value,
      qty: $("pqty").value, expiry: $("pexp").value, brand: $("pbrand").value
    });
    ["pname", "pprice", "pqty", "pexp", "pbrand"].forEach(i => $(i).value = "");
    toast("Product added");
  });
}
let pendingDelete = null;               // confirm with a second click
function doDelete(id) {
  if (pendingDelete !== id) { pendingDelete = id; return toast("Click Delete again to confirm", false); }
  pendingDelete = null;
  guard(async () => { await api("DELETE", "/products/" + id); toast("Product deleted"); });
}

// ---------- sell ----------
function fillSellList() {
  const keep = $("sellProd").value;
  $("sellProd").innerHTML = products.map(p => `<option value="${p.id}">${esc(p.name)} (stock ${p.qty}, ${money(p.price)})</option>`).join("");
  $("sellProd").value = keep;
}
function doSell() {
  guard(async () => {
    const { sale: s, queued } = await api("POST", "/sales", { productId: $("sellProd").value, qty: $("sellQty").value });
    $("bill").innerHTML = `<div class="bill">----- BILL -----
Bill No: ${s.no}
Date   : ${s.date}
Item   : ${esc(s.name)}
Qty    : ${s.qty}
Price  : ${money(s.total / s.qty)}
Total  : ${money(s.total)}
----------------</div>`;
    toast(queued ? "Sale done. Low stock: added to the restock queue" : "Sale done");
  });
}

// ---------- history and undo ----------
async function showHistory() {
  const sales = await api("GET", "/sales");
  $("histTable").innerHTML = "<tr><th>Bill</th><th>Date</th><th>Item</th><th>Qty</th><th>Total</th></tr>" +
    sales.map(s => `<tr><td>${s.no}</td><td>${s.date}</td><td>${esc(s.name)}</td><td>${s.qty}</td><td>${money(s.total)}</td></tr>`).join("");
}
function doUndo() {
  guard(async () => { const s = await api("POST", "/sales/undo"); $("bill").innerHTML = ""; toast(`Bill ${s.no} undone, stock restored`); });
}

// ---------- restock ----------
async function showRestock() {
  const { recommend, queue } = await api("GET", "/restock");
  $("recTable").innerHTML = "<tr><th>Name</th><th>Stock</th><th>Suggested order</th></tr>" +
    (recommend.map(r => `<tr><td>${esc(r.name)}</td><td>${r.qty}</td><td>${r.order}</td></tr>`).join("") || "<tr><td colspan='3'>All products have enough stock</td></tr>");
  $("queueList").innerHTML = queue.length === 0 ? "Queue is empty" :
    "<ol>" + queue.map(q => `<li>${esc(q.name || "(deleted product)")}</li>`).join("") + "</ol>";
}
function queueAll() {
  guard(async () => { const r = await api("POST", "/restock/queue-all"); toast(r.count + " request(s) queued"); });
}
function doReceive() {
  guard(async () => {
    const r = await api("POST", "/restock/receive", { qty: $("recvQty").value });
    $("recvQty").value = "";
    toast(r.product ? `Received. ${r.product.name} stock is now ${r.product.qty}` : "That product no longer exists, request dropped");
  });
}

// ---------- start ----------
$("pass").onkeydown = e => { if (e.key === "Enter") doLogin(); };
