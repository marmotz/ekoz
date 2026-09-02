import { describe, expect, it } from "vitest";

import {
  EkozError,
  ProtocolMismatchError,
  RateLimitError,
  ValidationError,
} from "./errors.js";

describe("error hierarchy", () => {
  it("keeps a working instanceof chain and name", () => {
    const error = new RateLimitError({
      code: "auth.too_many_requests",
      status: 429,
      retryAfter: 10,
    });
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error).toBeInstanceOf(EkozError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("RateLimitError");
    expect(error.retryAfter).toBe(10);
  });

  it("defaults ValidationError issues to an empty array", () => {
    const error = new ValidationError({ code: "validation_failed", status: 422 });
    expect(error.issues).toEqual([]);
  });

  it("builds a descriptive ProtocolMismatchError", () => {
    const error = new ProtocolMismatchError({
      supported: ["0"],
      advertised: ["1", "2"],
    });
    expect(error.code).toBe("protocol.mismatch");
    expect(error.message).toContain("[0]");
    expect(error.message).toContain("1, 2");
  });

  it("uses detail, then title, then code as the message", () => {
    expect(
      new EkozError({ code: "c", status: 400, detail: "d", title: "t" }).message,
    ).toBe("d");
    expect(new EkozError({ code: "c", status: 400, title: "t" }).message).toBe("t");
    expect(new EkozError({ code: "c", status: 400 }).message).toBe("c");
  });
});
