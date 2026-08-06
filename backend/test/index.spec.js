import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

function pngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]).buffer;
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
