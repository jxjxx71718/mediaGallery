# **README**

## **Tech Stack**

**Backend**

* Node.js 18+
* Express.js 4.x
* JSON file database (`db.json`)
* Jest + Supertest (API tests)

**Frontend**

* Pure HTML / CSS / JavaScript
* Public Gallery (`gallery.html`)
* Admin Panel (`admin.html`) with client-side auth (LocalStorage)

---

## **Setup Instructions**

### **1. Install dependencies**

```bash
npm install
```

### **2. Start backend + frontend**

```bash
node server.js
```

App runs at:
➡ **[http://localhost:3000](http://localhost:3000)**

The server:

* Serves `/public` (gallery + admin UI)
* Provides CRUD API at `/api/media`
* Stores data in `db.json` (auto-created)

---

## **Running the Frontend**

### **Public Gallery**

```
http://localhost:3000/gallery.html
```

### **Admin Panel**

```
http://localhost:3000/admin.html
```

Default login (client-side only):

```
Username: admin
Password: 0000
```

Admin Panel supports:

* Create / edit / delete media
* Multiple images or single video (YouTube link, local images stored in /static)
* Per-image metadata
* Filters + soft reset

---

## **Run Tests**

Tests use the exported Express app (no server listening).

```bash
npm test
```

Covers:

* Valid/invalid media creation
* Public API returning only published items
* DB isolation using test temp file

---

## **Assumptions & Trade-offs**

* Lightweight client-side authentication (not secure)
* JSON file used instead of a real database (simple, sufficient for demo)
* No upload API; media is provided as URLs
* Frontend is plain HTML/JS to keep setup minimal
* Suitable for small-scale usage / assignment context

