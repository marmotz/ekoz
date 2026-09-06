import { describe, expect, it } from "vitest";

import { Discovery } from "./discovery.js";
import { ProtocolMismatchError } from "../transport/errors.js";
import { createFetchMock, jsonResponse } from "../test-support/fetch-mock.js";

const DOC = {
  server: "ekoz.example.com",
  api: "https://api.ekoz.example.com/",
  web: "https://ekoz.example.com",
  protocol_versions: ["0"],
};

describe("Discovery", () => {
  it("resolves the well-known document and exposes the trimmed api URL", async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: DOC }));
    const discovery = new Discovery({ server: "ekoz.example.com", fetch: fetchMock });

    const doc = await discovery.get();
    expect(doc.protocol_versions).toEqual(["0"]);
    expect(fetchMock.calls[0]!.url).toBe(
      "https://ekoz.example.com/.well-known/ekoz",
    );
    await expect(discovery.apiBaseUrl()).resolves.toBe(
      "https://api.ekoz.example.com",
    );
  });

  it("caches the document for the client lifetime", async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: DOC }));
    const discovery = new Discovery({ server: "ekoz.example.com", fetch: fetchMock });

    await discovery.get();
    await discovery.get();
    await discovery.apiBaseUrl();
    expect(fetchMock.callCount).toBe(1);
  });

  it("de-duplicates concurrent resolutions", async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: DOC }));
    const discovery = new Discovery({ server: "ekoz.example.com", fetch: fetchMock });

    await Promise.all([discovery.get(), discovery.get(), discovery.get()]);
    expect(fetchMock.callCount).toBe(1);
  });

  it("refresh() forces a re-fetch", async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ body: DOC }),
      jsonResponse({ body: { ...DOC, web: "https://new.example.com" } }),
    );
    const discovery = new Discovery({ server: "ekoz.example.com", fetch: fetchMock });

    await discovery.get();
    const refreshed = await discovery.refresh();
    expect(refreshed.web).toBe("https://new.example.com");
    expect(fetchMock.callCount).toBe(2);
  });

  it("throws ProtocolMismatchError when version sets do not intersect", async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ body: { ...DOC, protocol_versions: ["1", "2"] } }),
    );
    const discovery = new Discovery({ server: "ekoz.example.com", fetch: fetchMock });

    await expect(discovery.get()).rejects.toBeInstanceOf(ProtocolMismatchError);
  });

  it("resolveApiUrl bypasses the discovery fetch and the protocol guard", async () => {
    const fetchMock = createFetchMock(new Error("should not be called"));
    const discovery = new Discovery({
      resolveApiUrl: () => "http://localhost:4000/",
      fetch: fetchMock,
    });

    await expect(discovery.apiBaseUrl()).resolves.toBe("http://localhost:4000");
    expect(fetchMock.callCount).toBe(0);
    await expect(discovery.get()).rejects.toThrow(/resolveApiUrl/);
  });

  it("requires either server or resolveApiUrl", () => {
    expect(() => new Discovery({})).toThrow(TypeError);
  });
});
