"use strict";
// ==================================================================
// Smart Inventory System: backend (Node.js, no external packages)
//   - REST API under /api
//   - serves the frontend folder as static files
// Run:  npm start   ->  http://localhost:3000
// ==================================================================
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Inventory, ShopError, StockError } = require("./inventory");

const PORT = process.env.PORT || 3000;
const FRONTEND = path.join(__dirname, "..", "frontend");
const inv = new Inventory(path.join(__dirname, "data", "inventory.json"));
inv.load();

// Demo users (same as before). For a real shop, store hashed passwords in a database.
const USERS = { admin: { pass: "admin123", role: "Admin" }, staff: { pass: "staff123", role: "Staff" } };
const sessions = new Map();                      // token -> { name, role }

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// ---------- helpers ----------
function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", c => { raw += c; if (raw.length > 1e6) { reject(new HttpError(413, "Request too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new HttpError(400, "Invalid JSON")); } });
    req.on("error", reject);
  });
}
function auth(req, adminOnly) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const s = sessions.get(token);
  if (!s) throw new HttpError(401, "Please log in");
  if (adminOnly && s.role !== "Admin") throw new HttpError(403, "Admin access only");
  return s;
}
const id = s => parseInt(s, 10);

// ---------- API routes ----------
async function api(req, res, url) {
  const m = req.method, p = url.pathname;

  if (m === "POST" && p === "/api/login") {
    const b = await readBody(req), u = USERS[String(b.username || "").trim()];
    if (!u || u.pass !== b.password) throw new HttpError(401, "Wrong username or password");
    const token = crypto.randomBytes(24).toString("hex");
    const name = String(b.username).trim();
    sessions.set(token, { name, role: u.role });
    return send(res, 200, { token, name, role: u.role });
  }
  if (m === "POST" && p === "/api/logout") {
    sessions.delete((req.headers.authorization || "").replace("Bearer ", ""));
    return send(res, 200, { ok: true });
  }

  // Products: staff and admin can view; only admin can add / delete
  if (m === "GET" && p === "/api/products") {
    auth(req);
    return send(res, 200, inv.products.map(x => x.toView()));
  }
  if (m === "POST" && p === "/api/products") {
    auth(req, true);
    const b = await readBody(req);
    const prod = inv.addProduct(b.type, b);
    inv.save();
    return send(res, 201, prod.toView());
  }
  let r = p.match(/^\/api\/products\/(\d+)$/);
  if (m === "DELETE" && r) {
    auth(req, true);
    inv.remove(id(r[1]));
    inv.save();
    return send(res, 200, { ok: true });
  }

  // Sales: staff and admin
  if (m === "POST" && p === "/api/sales") {
    auth(req);
    const b = await readBody(req);
    const out = inv.sell(id(b.productId), Number(b.qty));
    inv.save();
    return send(res, 201, out);                  // { sale, queued }
  }

  // History and undo: admin
  if (m === "GET" && p === "/api/sales") {
    auth(req, true);
    return send(res, 200, inv.history.toArray());
  }
  if (m === "POST" && p === "/api/sales/undo") {
    auth(req, true);
    const sale = inv.undoLast();
    inv.save();
    return send(res, 200, sale);
  }

  // Restock: admin
  if (m === "GET" && p === "/api/restock") {
    auth(req, true);
    return send(res, 200, {
      recommend: inv.recommend().map(x => ({ id: x.p.id, name: x.p.name, qty: x.p.qty, order: x.order })),
      queue: inv.queue.toArray().map(pid => ({ id: pid, name: inv.find(pid) ? inv.find(pid).name : null }))
    });
  }
  if (m === "POST" && p === "/api/restock/queue-all") {
    auth(req, true);
    const count = inv.queueAll();
    inv.save();
    return send(res, 200, { count });
  }
  if (m === "POST" && p === "/api/restock/receive") {
    auth(req, true);
    const b = await readBody(req);
    const prod = inv.receive(Number(b.qty));
    inv.save();
    return send(res, 200, { product: prod ? prod.toView() : null });
  }

  throw new HttpError(404, "API route not found");
}

// ---------- static files (frontend) ----------
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".ico": "image/x-icon", ".svg": "image/svg+xml" };
function serveStatic(req, res, url) {
  let file = path.normalize(path.join(FRONTEND, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
  if (!file.startsWith(FRONTEND)) { res.writeHead(403); return res.end("Forbidden"); }   // block ../ tricks
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": (TYPES[path.extname(file)] || "application/octet-stream") + "; charset=utf-8" });
    res.end(data);
  });
}

// ---------- server ----------
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/")) return serveStatic(req, res, url);
  try { await api(req, res, url); }
  catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    if (e instanceof StockError) return send(res, 409, { error: e.message });
    if (e instanceof ShopError) return send(res, 400, { error: e.message });
    console.error(e);
    send(res, 500, { error: "Server error" });
  }
}).listen(PORT, () => console.log(`Smart Inventory System running at http://localhost:${PORT}`));
