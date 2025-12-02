# DESIGN.md

## Project Structure & Architecture

The project is designed as a simple full-stack application with a clear separation between:

### 1. Backend Layer (server.js)

* Built with **Express.js**.
* Provides REST endpoints at `/api/media` for CRUD operations.
* Uses a lightweight **JSON file (`db.json`) as storage**, auto-created on first run.
* Exports `{ app, setDbPath, resetDbFile }` for testing.
* Serves static files from `/public`, including gallery UI and admin UI.

**Modules inside server.js:**

* **DB helpers:** `readDB()`, `writeDB()`, test-path override.
* **Validation layer:** Ensures required fields like `title`, valid `type` (`image` or `video`), and media URLs.
* **CRUD routes:**

  * `GET /api/media` – all items
  * `GET /api/media/:id` – single item
  * `POST /api/media` – create
  * `PUT /api/media/:id` – update
  * `DELETE /api/media/:id` – delete
* **Public subset:** `/api/public/media` returns only items with `status = "published"`.

---

### 2. Frontend Layer (`public/`)

Contains three main pages:

#### gallery.html

* Public-facing gallery.
* Fetches only **published** items.
* Detects video type:

  * YouTube URL → `<iframe>`
  * MP4 or other local video → `<video>`
* Displays thumbnails for images only.

#### detail.html

* Displays full item information when a thumbnail is clicked.

#### admin.html

* CRUD interface for media.
* Client-side authentication stored in `localStorage`.
* Features:

  * Live list with filtering (status/type/tag)
  * Form for editing or adding items
  * Metadata blocks synced to media URL count
  * Soft reset for full UI refresh (filters, form, list)

The frontend does not use frameworks, keeping the system simple and portable.

---

## Key Design Decisions

### 1. MediaItem Model

Each item is stored as a simple JSON object:

```json
{
  "id": 1,
  "type": "image" | "video",
  "title": "Cat A",
  "status": "published" | "draft",
  "tags": ["cute", "white"],
  "mediaUrls": ["/static/a.jpg"],
  "mediaUrl": "/uploads/video.mp4",
  "thumbnailUrl": "/static/a_thumb.jpg",
  "mediaMeta": [{}],
  "createdAt": "...",
  "updatedAt": "..."
}
