// ============================================================
// backend/test/index.spec.js — vitest suite for the Worker
// Exercises badge serve/upload and the join route against a
// mocked GitHub API (cloudflare:test pool).
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SELF, fetchMock } from "cloudflare:test";

function pngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]).buffer;
}

function b64(str) {
  return Buffer.from(str).toString("base64");
}

// Build a multipart join request body.
function joinBody(fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}

const FIELDS = {
  name: "Shivam",
  website: "https://shivam.example",
  program: "B.Tech CSE",
  gradDate: "15/05/2027",
  collegeEmail: "sn1234@srmist.edu.in",
  personalEmail: "shivam@example.com",
  location: "Delhi",
  badge: "https://badge.example/b.png",
};

// Mock the GitHub API a join request touches. `members` is mutated in place
// after each successful PR to simulate the merged members.json on main.
// `times` is how many join requests the test will make (each endpoint is hit
// once per join), so interceptors are fully consumed before the afterEach
// `assertNoPendingInterceptors` check.
function mockGitHub(members, putBodies, times = 1) {
  const gh = fetchMock.get("https://api.github.com");
  gh.intercept({ path: "/repos/io-PEAK/srm-ncr-webring/contents/data/members.json", method: "GET" })
    .reply(200, () => ({ content: b64(JSON.stringify(members, null, 2)), sha: "file-sha" })).times(times);
  gh.intercept({ path: "/repos/io-PEAK/srm-ncr-webring/git/ref/heads/main", method: "GET" })
    .reply(200, () => ({ object: { sha: "main-sha" } })).times(times);
  gh.intercept({ path: "/repos/io-PEAK/srm-ncr-webring/contents/data/cities.json", method: "GET" })
    .reply(404, () => ({})).times(times);
  gh.intercept({ path: "/repos/io-PEAK/srm-ncr-webring/git/refs", method: "POST" })
    .reply(201, () => ({})).times(times);
  gh.intercept({ path: "/repos/io-PEAK/srm-ncr-webring/contents/data/members.json", method: "PUT" })
    .reply(200, (opts) => {
      const body = JSON.parse(opts.body);
      putBodies.push(body);
      members.splice(0, members.length, ...JSON.parse(Buffer.from(body.content, "base64").toString()));
      return { content: {} };
    }).times(times);
  gh.intercept({ path: "/repos/io-PEAK/srm-ncr-webring/pulls", method: "POST" })
    .reply(201, () => ({ html_url: "https://github.com/io-PEAK/srm-ncr-webring/pull/1" })).times(times);
}

describe("badge serve route", () => {
  it("returns 404 for a missing badge", async () => {
    const response = await SELF.fetch("https://worker.dev/badges/nope.png");
    expect(response.status).toBe(404);
  });
});

describe("update-badge route", () => {
  it("rejects an uploaded file that is not a real image (magic bytes)", async () => {
    const form = new FormData();
    form.append("site", "https://shivam.example");
    form.append("badgeFile", new File(["<!DOCTYPE html>"], "badge.png", { type: "image/png" }));
    const response = await SELF.fetch("https://worker.dev/update-badge", { method: "POST", body: form });
    expect(response.status).toBe(400);
  });

  it("stores a valid PNG and serves it back with the right content type", async () => {
    const form = new FormData();
    form.append("site", "https://shivam.example");
    form.append("badgeFile", new File([pngBytes()], "badge.png", { type: "image/png" }));
    const response = await SELF.fetch("https://worker.dev/update-badge", { method: "POST", body: form });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const image = await SELF.fetch(body.badgeUrl);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await image.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("accepts a GIF (magic bytes 47 49 46 38) and serves it as image/gif", async () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]).buffer;
    const form = new FormData();
    form.append("site", "https://gif.example");
    form.append("badgeFile", new File([gif], "badge.gif", { type: "image/gif" }));
    const response = await SELF.fetch("https://worker.dev/update-badge", { method: "POST", body: form });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.badgeUrl.endsWith(".gif")).toBe(true);

    const image = await SELF.fetch(body.badgeUrl);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/gif");
    const bytes = new Uint8Array(await image.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x47, 0x49, 0x46, 0x38]);
  });

  it("re-uploading a badge for the same site rewrites the old one (same URL, new bytes)", async () => {
    const firstPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xaa, 0xbb]).buffer;
    const secondPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xcc, 0xdd]).buffer;

    const upload = (bytes) => {
      const form = new FormData();
      form.append("site", "https://rewrite.example");
      form.append("badgeFile", new File([bytes], "badge.png", { type: "image/png" }));
      return SELF.fetch("https://worker.dev/update-badge", { method: "POST", body: form });
    };

    const first = await (await upload(firstPng)).json();
    const second = await (await upload(secondPng)).json();
    expect(first.badgeUrl).toBe(second.badgeUrl);

    const served = new Uint8Array(await (await SELF.fetch(first.badgeUrl)).arrayBuffer());
    expect(Array.from(served.slice(8, 10))).toEqual([0xcc, 0xdd]);
  });
});

describe("join route", () => {
  beforeEach(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });
  afterEach(() => {
    fetchMock.assertNoPendingInterceptors();
    fetchMock.deactivate();
  });

  it("re-joining with the same college email overwrites the existing entry", async () => {
    const members = [];
    const putBodies = [];
    mockGitHub(members, putBodies, 2);

    const first = await SELF.fetch("https://worker.dev/join", { method: "POST", body: joinBody(FIELDS) });
    expect(first.status).toBe(200);
    expect(members).toHaveLength(1);

    const updated = await SELF.fetch("https://worker.dev/join", {
      method: "POST",
      body: joinBody({
        ...FIELDS,
        name: "Shivam Kumar",
        website: "https://shivam-dev.example",
        location: "Noida",
      }),
    });
    expect(updated.status).toBe(200);

    // Still one member, with the new details — not a duplicate.
    expect(members).toHaveLength(1);
    expect(members[0].name).toBe("Shivam Kumar");
    expect(members[0].website).toBe("https://shivam-dev.example");
    expect(members[0].collegeEmail).toBeUndefined();
    expect(putBodies[1].message).toBe("Update Shivam Kumar in webring");
  });

  it("re-joining with the same college email and same site updates in place (not rejected)", async () => {
    const members = [];
    const putBodies = [];
    mockGitHub(members, putBodies, 2);

    await SELF.fetch("https://worker.dev/join", { method: "POST", body: joinBody(FIELDS) });
    const again = await SELF.fetch("https://worker.dev/join", {
      method: "POST",
      body: joinBody({ ...FIELDS, program: "B.Tech ECE" }),
    });

    expect(again.status).toBe(200);
    expect(members).toHaveLength(1);
    expect(members[0].program).toBe("B.Tech ECE");
  });

  it("rejects a different person registering an already-taken site", async () => {
    const gh = fetchMock.get("https://api.github.com");
    gh.intercept({ path: "/repos/io-PEAK/srm-ncr-webring/contents/data/members.json", method: "GET" })
      .reply(200, () => ({ content: b64(JSON.stringify([{ name: "Existing", website: "https://shivam.example" }], null, 2)), sha: "file-sha" }));

    const res = await SELF.fetch("https://worker.dev/join", {
      method: "POST",
      body: joinBody({ ...FIELDS, name: "Intruder", collegeEmail: "other@srmist.edu.in" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("already in the webring");
  });

  it("rejects a join missing required fields", async () => {
    const res = await SELF.fetch("https://worker.dev/join", {
      method: "POST",
      body: joinBody({ name: "No Website" }),
    });
    expect(res.status).toBe(400);
  });
});
