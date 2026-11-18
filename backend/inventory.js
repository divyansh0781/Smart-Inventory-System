"use strict";
// ==================================================================
// Business logic: errors, data structures (Stack, Queue, LinkedList),
// product classes (OOP) and the Inventory that ties everything together.
// ==================================================================
const fs = require("fs");
const path = require("path");

const LOW = 5; // stock below this = needs restock

function today() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// ---------- Exceptions (StockError is a child of ShopError) ----------
class ShopError extends Error {}
class StockError extends ShopError {}

// ---------- DSA written by hand ----------
class Stack {                                    // last in, first out -> Undo last sale
  constructor() { this.data = []; this.top = -1; }
  isEmpty() { return this.top === -1; }
  push(x) { this.data[++this.top] = x; }
  pop() {
    if (this.isEmpty()) throw new ShopError("Nothing to undo");
    const x = this.data[this.top];
    this.top--;
    this.data.length = this.top + 1;
    return x;
  }
}
class Queue {                                    // first in, first out -> Restock requests
  constructor() { this.data = []; this.front = 0; }
  isEmpty() { return this.front >= this.data.length; }
  enqueue(x) { this.data.push(x); }
  dequeue() {
    if (this.isEmpty()) throw new ShopError("The restock queue is empty");
    return this.data[this.front++];
  }
  toArray() { return this.data.slice(this.front); }
  has(x) { return this.toArray().includes(x); }
}
class LinkedList {                               // nodes joined by "next" -> Sales history
  constructor() { this.head = null; }
  insertFirst(x) { this.head = { data: x, next: this.head }; }
  removeFirst() { if (this.head) this.head = this.head.next; }
  toArray() { const a = []; for (let n = this.head; n; n = n.next) a.push(n.data); return a; }
}

// ---------- Product classes (inheritance + polymorphism) ----------
class Product {
  constructor(id, name, price, qty) { this.id = id; this.name = name; this.price = price; this.qty = qty; }
  get kind() { return "G"; }
  get type() { return "General"; }
  get extra() { return "-"; }
  isLow() { return this.qty < LOW; }
  isExpired() { return false; }
  sell(n) {
    if (!Number.isInteger(n) || n <= 0) throw new ShopError("Quantity must be a whole number, at least 1");
    if (n > this.qty) throw new StockError(`Only ${this.qty} unit(s) of ${this.name} in stock`);
    this.qty -= n;
  }
  add(n) { this.qty += n; }
  toData() { return { kind: this.kind, id: this.id, name: this.name, price: this.price, qty: this.qty }; }
  // Shape sent to the frontend (data + display fields computed on the server)
  toView() { return { ...this.toData(), type: this.type, extra: this.extra, low: this.isLow(), expired: this.isExpired() }; }
}
class Perishable extends Product {
  constructor(id, name, price, qty, expiry) { super(id, name, price, qty); this.expiry = expiry; }
  get kind() { return "P"; }
  get type() { return "Perishable"; }
  get extra() { return "Exp " + this.expiry; }
  isExpired() { return this.expiry < today(); }  // YYYY-MM-DD dates compare as text
  toData() { return { ...super.toData(), expiry: this.expiry }; }
}
class Branded extends Product {
  constructor(id, name, price, qty, brand) { super(id, name, price, qty); this.brand = brand; }
  get kind() { return "B"; }
  get type() { return "Branded"; }
  get extra() { return "Brand " + this.brand; }
  toData() { return { ...super.toData(), brand: this.brand }; }
}
class PackagedFood extends Perishable {
  constructor(id, name, price, qty, expiry, brand) { super(id, name, price, qty, expiry); this.brand = brand; }
  get kind() { return "F"; }
  get type() { return "Packaged"; }
  get extra() { return "Exp " + this.expiry + ", " + this.brand; }
  toData() { return { ...super.toData(), brand: this.brand }; }
}
// Factory: builds the right class from saved / submitted data
const MAKE = {
  G: d => new Product(d.id, d.name, d.price, d.qty),
  P: d => new Perishable(d.id, d.name, d.price, d.qty, d.expiry),
  B: d => new Branded(d.id, d.name, d.price, d.qty, d.brand),
  F: d => new PackagedFood(d.id, d.name, d.price, d.qty, d.expiry, d.brand)
};

// ---------- Inventory ----------
class Inventory {
  constructor(file) {
    this.file = file;                            // JSON file used for storage
    this.products = [];
    this.history = new LinkedList();             // all sales, newest first
    this.undo = new Stack();                     // sales that can be undone
    this.queue = new Queue();                    // product ids waiting for restock
    this.nextNo = 1;                             // next bill number
  }
  find(id) { return this.products.find(p => p.id === id); }
  nextId() { return this.products.reduce((m, p) => Math.max(m, p.id), 0) + 1; }

  addProduct(t, input) {
    if (!MAKE[t]) throw new ShopError("Unknown product type");
    const name = String(input.name || "").trim();
    const price = Number(input.price), qty = Number(input.qty);
    const expiry = String(input.expiry || ""), brand = String(input.brand || "").trim();
    if (!name) throw new ShopError("Enter a name");
    if (!(price >= 0)) throw new ShopError("Enter a price (0 or more)");
    if (!Number.isInteger(qty) || qty < 0) throw new ShopError("Enter a quantity (0 or more, whole number)");
    if ((t === "P" || t === "F") && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) throw new ShopError("Choose an expiry date");
    if ((t === "B" || t === "F") && !brand) throw new ShopError("Enter a brand");
    const p = MAKE[t]({ id: this.nextId(), name, price, qty, expiry, brand });
    this.products.push(p);
    return p;
  }
  remove(id) {
    const i = this.products.findIndex(p => p.id === id);
    if (i < 0) throw new ShopError("Product not found");
    this.products.splice(i, 1);
  }
  sell(id, qty) {
    const p = this.find(id);
    if (!p) throw new ShopError("Product not found");
    if (p.isExpired()) throw new ShopError(p.name + " is expired and cannot be sold");
    p.sell(qty);                                 // throws StockError if not enough
    const sale = { no: this.nextNo++, id, name: p.name, qty, total: qty * p.price, date: today() };
    this.history.insertFirst(sale);              // linked list: new node at the head
    this.undo.push(sale);                        // stack: push
    let queued = false;
    if (p.isLow() && !this.queue.has(id)) { this.queue.enqueue(id); queued = true; }  // low stock -> restock queue
    return { sale, queued };
  }
  undoLast() {
    const sale = this.undo.pop();                // stack: newest sale comes out first
    const p = this.find(sale.id);
    if (p) p.add(sale.qty);                      // give the stock back
    this.history.removeFirst();                  // newest sale is the head of the list
    return sale;
  }
  recommend() {                                  // low products, emptiest first, with order size
    return this.products.filter(p => p.isLow()).sort((a, b) => a.qty - b.qty)
      .map(p => ({ p, order: Math.max(1, LOW * 2 - p.qty) }));
  }
  queueAll() {
    const rec = this.recommend().filter(r => !this.queue.has(r.p.id));
    if (!rec.length) throw new ShopError("Nothing new to queue");
    rec.forEach(r => this.queue.enqueue(r.p.id)); // most urgent goes in first
    return rec.length;
  }
  receive(qty) {
    if (!Number.isInteger(qty) || qty <= 0) throw new ShopError("Enter the quantity received (whole number, at least 1)");
    const id = this.queue.dequeue();             // queue: oldest request comes out first
    const p = this.find(id);
    if (p) p.add(qty);
    return p || null;                            // null if the product was deleted
  }

  // ---------- storage (JSON file on disk) ----------
  save() {
    const data = {
      products: this.products.map(p => p.toData()), history: this.history.toArray(),
      queue: this.queue.toArray(), nextNo: this.nextNo
    };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this.file);               // swap in one step so the file is never half-written
  }
  load() {
    let d = null;
    try { d = JSON.parse(fs.readFileSync(this.file, "utf8")); } catch (e) { d = null; }
    if (!d) {                                    // first run: demo data
      this.products = [
        new Product(1, "Notebook", 40, 50), new Product(2, "Ball Pen", 10, 200),
        new Perishable(3, "Fresh Milk", 60, 8, "2027-03-31"), new Perishable(4, "Old Yogurt", 30, 10, "2026-09-01"),
        new Branded(5, "Torch", 220, 3, "Eveready"), new PackagedFood(6, "Butter Cookies", 80, 40, "2027-06-30", "Britannia"),
        new PackagedFood(7, "Noodles", 15, 4, "2027-08-20", "Maggi")];
      return;
    }
    this.products = d.products.map(x => MAKE[x.kind](x));
    const sales = d.history;                     // saved newest first
    for (let i = sales.length - 1; i >= 0; i--) { this.history.insertFirst(sales[i]); this.undo.push(sales[i]); }
    d.queue.forEach(id => this.queue.enqueue(id));
    this.nextNo = d.nextNo;
  }
}

module.exports = { Inventory, ShopError, StockError, LOW };
