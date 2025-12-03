// __tests__/media.test.js
const request = require("supertest");
const fs = require("fs");
const path = require("path");

// require the server module (support both shapes: app or { app, ... })
const serverModule = require("../server");

// resolve app and optional helpers
const app = serverModule.app || serverModule;
const setDbPath = serverModule.setDbPath || (() => { });
const resetDbFile = serverModule.resetDbFile || (() => { });

// test DB path (inside tests folder)
const TEST_DB = path.join(__dirname, "test-db.json");

beforeAll(() => {
    // point server to test DB file (no-op if server doesn't expose setDbPath)
    setDbPath(TEST_DB);

    // remove old file if exists
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

    // create an empty DB file so server's readDB won't fail (resetDbFile if available)
    if (typeof resetDbFile === "function" && resetDbFile !== (() => { })) {
        resetDbFile();
    } else {
        fs.writeFileSync(TEST_DB, JSON.stringify([], null, 2), "utf8");
    }
});

afterEach(() => {
    // clear DB between tests to keep tests isolated
    if (typeof resetDbFile === "function" && resetDbFile !== (() => { })) {
        resetDbFile();
    } else if (fs.existsSync(TEST_DB)) {
        fs.writeFileSync(TEST_DB, JSON.stringify([], null, 2), "utf8");
    }
});

afterAll(() => {
    // cleanup test DB file
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

describe("Media API Tests", () => {
    test("Creates a valid media item", async () => {
        const res = await request(app)
            .post("/api/media")
            .send({
                title: "Test Item",
                type: "image",
                status: "published",
                mediaUrls: ["/static/test1.jpg"],
                tags: ["cute", "cat"]
            });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty("id");
        expect(res.body.title).toBe("Test Item");
    });

    test("Rejects creation when title is missing", async () => {
        const res = await request(app)
            .post("/api/media")
            .send({
                type: "image",
                status: "draft",
                mediaUrls: ["/x.jpg"]
            });

        expect(res.status).toBe(400);
        // error message may vary, check it mentions 'title'
        expect(res.body.error).toMatch(/title/i);
    });

    test("Rejects invalid media type", async () => {
        const res = await request(app)
            .post("/api/media")
            .send({
                title: "Test",
                type: "audio", // invalid
                status: "draft",
                mediaUrls: ["/x.jpg"]
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/type/i);
    });

    test("Fetch only published items for public API", async () => {
        // create draft
        await request(app).post("/api/media").send({
            title: "Draft item",
            type: "image",
            status: "draft",
            mediaUrls: ["/draft.jpg"]
        });

        // create published
        await request(app).post("/api/media").send({
            title: "Published item",
            type: "image",
            status: "published",
            mediaUrls: ["/pub.jpg"]
        });

        const res = await request(app).get("/api/public/media");

        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThan(0);

        // All must be published
        for (const item of res.body) {
            expect(String(item.status).toLowerCase()).toBe("published");
        }
    });
});
