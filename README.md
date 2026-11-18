# Smart Inventory and Sales System

A small inventory and sales app: plain HTML/CSS/JS **frontend** and a Node.js **backend** (no external packages) that exposes a REST API and stores data in a JSON file.

## Features
- Login with roles (Admin / Staff)
- Products: search, sort, add, delete (Perishable, Branded and Packaged types)
- Sales with printable bill, expired products blocked
- Sales history (linked list) and Undo last sale (stack)
- Restock recommendations and restock queue (queue, first in first out)

## Project structure
```
smart-inventory-system/
├── backend/
│   ├── server.js       # HTTP server, REST API, serves the frontend
│   ├── inventory.js    # Stack, Queue, LinkedList, product classes, Inventory
│   └── data/           # inventory.json is created here (git-ignored)
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js          # screens, talks to the API with fetch()
├── package.json
└── README.md
```

## Run it
Requires [Node.js](https://nodejs.org) 16 or newer.
```bash
npm start
```
Open http://localhost:3000

Demo logins: `admin / admin123` (all tabs) and `staff / staff123` (Products and Sell only).

## API
| Method | Route | Access |
|---|---|---|
| POST | `/api/login`, `/api/logout` | public / logged in |
| GET | `/api/products` | any user |
| POST | `/api/products` | admin |
| DELETE | `/api/products/:id` | admin |
| POST | `/api/sales` | any user |
| GET | `/api/sales` | admin |
| POST | `/api/sales/undo` | admin |
| GET | `/api/restock` | admin |
| POST | `/api/restock/queue-all` | admin |
| POST | `/api/restock/receive` | admin |
