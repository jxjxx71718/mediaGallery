# DESIGN.md

## Project Structure & Architecture

The project is a simple full-stack application with a clear separation between backend and frontend. This revision documents support for **both URL-based and local file uploads** for *images* and *videos*, and the minimal server + client changes required to support them safely and predictably.

---

### 1. Backend Layer (`server.js`)

* **Platform:** Express.js.
* **Storage:** Lightweight JSON file (`db.json`) by default; public files served from `/public` (e.g., `/public/uploads`).
* **Exports for testing:** `{ app, setDbPath, resetDbFile }`.
* **New upload endpoint:** `POST /api/media/upload` — accepts `multipart/form-data` file uploads and returns `{ url: string, thumbnailUrl?: string }`.

  * Implement with `multer` (disk storage) or an S3/R2 adapter in production.
  * Optional post-processing with `ffmpeg` to generate a small `thumbnailUrl` for videos.
* **Existing CRUD endpoints (unchanged contract):**

  * `GET /api/media` — all items
  * `GET /api/media/:id` — single item
  * `POST /api/media` — create item (accepts local-upload URLs or remote URLs)
  * `PUT /api/media/:id` — update item
  * `DELETE /api/media/:id` — delete item
* **Public subset:** `GET /api/public/media` — returns only items with `status = "published"`.
* **Validation layer (enhanced):**

  * `title` required.
  * `type` must be `"image"` or `"video"`.
  * Acceptable media sources:

    * `mediaUrl` (string) → single canonical URL (local upload or remote URL).
    * `mediaUrls` (array of strings) → multiple resources (images or multiple images for a gallery).
    * `thumbnailUrl` (string) → small image used as poster/thumbnail (optional but recommended for videos).
    * `mediaMeta` (array) length should match `mediaUrls` when provided (UI warns if mismatch).
  * Validate that URLs are reachable or have acceptable schemes (`http`, `https`, `/static`), and check content-type or file extension when possible.
  * Reject suspicious uploads (excessive file size, non-media mime types).
* **Upload handling notes:**

  * Save uploaded files to `/public/uploads/<unique>` and return `url: /static/uploads/<unique>`.
  * For video uploads: optionally generate a thumbnail server-side (`thumbnailUrl`) and return it.
  * For base64 thumbnails (client-captured posters), accept and persist them as image files server-side (avoid storing large data URLs directly in DB).
* **Concurrency & DB safety:**

  * Continue using file-based DB for simplicity; serialize write access and perform atomic writes (write to temp file + rename).
  * Add basic file-locking or serialized queueing to reduce risk under concurrent requests.

---

### 2. Frontend Layer (`public/`)

Contains the three main pages; each has small updates to support local uploads and robust handling of mixed media:

#### `admin.html` (Admin UI)

* **Functionality added:**

  * File input(s) for local uploads (`<input type="file" accept="image/*,video/*">`), single or `multiple`.
  * Client-side preview for selected files (image previews or muted `<video>` preview).
  * A “Capture Poster” flow: capture a frame from the previewed video into a data URL and place it into `field-thumbnail` (the form still sends `thumbnailUrl` to the server; server should accept base64 and persist).
  * On Save: if a local file is selected, upload it first to `POST /api/media/upload`, receive `{ url, thumbnailUrl? }`, and include returned `url` and `thumbnailUrl` in the payload sent to `/api/media`.
* **Form behavior unchanged where possible:**

  * `type` still chosen by admin (`image` or `video`).
  * `mediaUrl` and/or `mediaUrls` fields remain; the admin can paste remote URLs instead of uploading local files.
  * `thumbnailUrl` can be provided manually (URL) or via client-captured data URL (client or server will persist).
  * Metadata blocks remain index-synced to `mediaUrls`.
* **UX decisions:**

  * Disable Save while an upload is in progress and show progress/status.
  * Warn on large files and enforce client-side size limits consistent with server limits.
  * If the admin uploads multiple files, the admin can reorder them (metadata ties to index).
* **Security & validation:**

  * Trim and sanitize input fields before sending.
  * Only accept files with allowed MIME types and enforce size limits on the client (and server).
  * Use `POST /api/media/upload` for binary uploads (not `/api/media` JSON route).

#### `gallery.html` (Public gallery)

* **Now supports mixed media (images + videos):**

  * `fetch('/api/public/media')` or `fetch('/api/media')` then filter `status === 'published'`.
  * Intro area chooses a published video when available (prefer `mediaUrl` or first `mediaUrls` element). Supports:

    * YouTube/Vimeo (embed via `<iframe>` when remote URL is a known provider).
    * Native video playback (`<video>` with `poster` from `thumbnailUrl` when not a known embed).
  * Thumbnail grid displays both image and video items:

    * Prefer `thumbnailUrl` for assigned poster images (fast, consistent thumbnails).
    * If `thumbnailUrl` absent for a video, fall back to the first `mediaUrls[0]` or `mediaUrl`. If that is a video, render a small `<video preload="metadata" muted>` as the thumb; otherwise render an `<img>`.
  * Detail pages (`detail.html`) should handle arrays (`mediaUrls`) and single `mediaUrl` gracefully and present appropriate players or lightboxes.
* **CORS & playback:**

  * Ensure uploaded video files are served with correct MIME type and CORS rules if hosted on another domain.
  * For poster capture (client-side), avoid using cross-origin remote videos for canvas extraction (CORS will block capture). Prefer server-side thumbnail generation for remote videos.

#### `detail.html` (Item page)

* Show image galleries if `mediaUrls` is an array of images.
* For videos:

  * Use `thumbnailUrl` as poster for `<video>`.
  * If `mediaUrl` is a YouTube short or remote embed, use `<iframe>`.
* Expose metadata and per-media metadata blocks next to each displayed media element.

---

## Data Model (MediaItem)

Updated to clearly represent both URL and uploaded-file flows:

```json
{
  "id": 1,
  "type": "image" | "video",
  "title": "Cat A",
  "status": "published" | "draft",
  "tags": ["cute", "white"],
  "mediaUrls": ["/static/uploads/a.jpg", "/static/uploads/b.jpg"],
  "mediaUrl": "/static/uploads/intro.mp4",        // optional single canonical URL
  "thumbnailUrl": "/static/uploads/a_thumb.jpg",  // optional poster/thumbnail
  "mediaMeta": [{}, {}],                          // parallel to mediaUrls
  "createdAt": "2025-12-03T10:00:00Z",
  "updatedAt": "2025-12-03T10:05:00Z"
}
```

**Notes:**

* Either `mediaUrl` or `mediaUrls` (or both) may be present — UI uses `mediaUrls` when multiple media are relevant (image galleries).
* `thumbnailUrl` is strongly recommended for videos to improve gallery performance.

---

## API Contract Additions

### `POST /api/media/upload`

* Request: `multipart/form-data` with field `file`.
* Response: `200 OK` JSON:

```json
{ "url": "/static/uploads/<filename>", "thumbnailUrl?: "/static/uploads/<thumb.jpg>" }
```

* Server validation: check MIME, file size, optionally transcode or generate a thumbnail.

### `POST /api/media` (create)

* Request body JSON (example with an uploaded file result):

```json
{
  "title": "New Video",
  "type": "video",
  "status": "published",
  "tags": ["calico"],
  "mediaUrl": "/static/uploads/abcd.mp4",
  "thumbnailUrl": "/static/uploads/abcd_thumb.jpg",
  "mediaMeta": []
}
```

* Server persists the object and returns created resource (including `id`).

---

## Edge Cases, Limitations & Recommendations

### Edge Cases

* **Mismatched meta length:** UI warns when `mediaMeta.length !== mediaUrls.length`. Server does not silently reorder metadata.
* **Remote video poster capture:** Client-side frame capture fails for cross-origin remote videos; prefer server thumbnail generation for remote URLs.
* **Large files:** Impose server size limits (e.g., 100MB default for videos) and mirror the limit on client-side validation.
* **Multiple video URLs:** If an admin pastes more than one video URL into the form, the UI should prevent saving and show a clear alert (e.g., "Please provide only a single video URL for items of type `video`"). Alternatively, add a future feature to support multiple video uploads — that would require updating the data model (`mediaUrls` for multiple videos), admin UX (per-video metadata and ordering), and server-side processing (thumbnails, transcoding, storage).


### Security & Performance

* Sanitize filenames and never trust client-provided paths.
* Serve uploads from a directory configured with correct headers (Content-Type, Cache-Control).
* Consider virus scanning for uploaded files in production.
* Move uploads to object storage (S3/R2) for scale and offload serving; keep only public CDN URLs in DB.

### Testing & Migration

* Add unit tests for upload flow and for `media` CRUD with both URL-based and local-uploaded items.
* For existing data: items with `mediaUrl` only should continue to work; add migration scripts if you introduce a required `thumbnailUrl` for videos.

---

## Roadmap / Potential Improvements

* Replace JSON file with SQLite/PostgreSQL for concurrency and scaling.
* Add signed upload URLs (pre-signed S3) to avoid upload bottleneck on the app server.
* Add server-side `ffmpeg` job queue to generate multiple poster sizes and transcode long videos for streaming-friendly formats.
* Add pagination, search, and sorting to the public API.
* Improve authentication for admin (session-based auth + RBAC).

---

## Implementation Checklist (pragmatic)

1. Add `POST /api/media/upload` (multer + disk or S3).
2. Update admin UI:

   * file input(s), preview, capture poster.
   * upload-first flow: upload file → get `url`, then include in `POST /api/media`.
   * disable Save during upload; show progress.
3. Update gallery UI:

   * `renderIntro()` uses `mediaUrl` or `mediaUrls[0]` and `thumbnailUrl`.
   * `renderThumbs()` supports both images and videos (prefer `thumbnailUrl`).
4. Update DB validation and create tests for local + URL-only posting flows.
5. Ensure server serves uploaded files and returns correct MIME types.

---

