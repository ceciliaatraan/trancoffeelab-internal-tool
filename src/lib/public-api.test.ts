import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, resolveAllowedOrigin } from "./public-api";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.useRealTimers();
});

describe("resolveAllowedOrigin", () => {
  it("returnerar null om inget origin skickas", () => {
    expect(resolveAllowedOrigin(null)).toBeNull();
  });

  it("tillåter trancoffeelab.com när den finns i PUBLIC_API_ALLOWED_ORIGINS", () => {
    process.env.PUBLIC_API_ALLOWED_ORIGINS = "https://trancoffeelab.com";
    expect(resolveAllowedOrigin("https://trancoffeelab.com")).toBe(
      "https://trancoffeelab.com",
    );
  });

  it("nekar ett origin som inte finns i listan", () => {
    process.env.PUBLIC_API_ALLOWED_ORIGINS = "https://trancoffeelab.com";
    expect(resolveAllowedOrigin("https://evil.example.com")).toBeNull();
  });

  it("tillåter localhost med valfri port i dev", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
    });
    process.env.PUBLIC_API_ALLOWED_ORIGINS = "https://trancoffeelab.com";
    expect(resolveAllowedOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(resolveAllowedOrigin("http://localhost:5173")).toBe("http://localhost:5173");
  });

  it("nekar localhost i produktion", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    });
    process.env.PUBLIC_API_ALLOWED_ORIGINS = "https://trancoffeelab.com";
    expect(resolveAllowedOrigin("http://localhost:3000")).toBeNull();
  });
});

describe("checkRateLimit", () => {
  it("tillåter anrop under gränsen och nekar därefter inom samma fönster", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, { limit: 3, windowMs: 60_000 }).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("återställer räknaren när fönstret har passerat", () => {
    vi.useFakeTimers();
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, { limit: 1, windowMs: 1000 }).allowed).toBe(true);
    expect(checkRateLimit(key, { limit: 1, windowMs: 1000 }).allowed).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(checkRateLimit(key, { limit: 1, windowMs: 1000 }).allowed).toBe(true);
  });
});
