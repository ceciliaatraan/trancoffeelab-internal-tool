import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KustomApiError,
  createOrder,
  extractHtmlSnippet,
  extractOrderId,
  readOrder,
  updateOrder,
} from "./client";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.KUSTOM_API_BASE_URL = "https://api.playground.kustom.co";
  process.env.KUSTOM_API_KEY = "kco_test_api_secret";
  delete process.env.KUSTOM_BASIC_AUTH_USERNAME;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === null ? "" : JSON.stringify(body)),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockFetchOnceRaw(status: number, rawText: string) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => rawText,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createOrder", () => {
  it("POSTar till /checkout/v3/orders med Basic auth-header", async () => {
    const fetchMock = mockFetchOnce(200, { order_id: "abc123", html_snippet: "<div></div>" });

    await createOrder({
      purchase_country: "SE",
      purchase_currency: "SEK",
      locale: "sv-SE",
      order_amount: 100,
      order_tax_amount: 10,
      order_lines: [],
      merchant_urls: {
        terms: "t",
        checkout: "c",
        confirmation: "conf",
        push: "p",
        validation: "v",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.playground.kustom.co/checkout/v3/orders");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toMatch(/^Basic /);
    expect(JSON.parse(init.body).order_amount).toBe(100);
  });

  it("kastar KustomApiError (inte SyntaxError) om felsvaret inte är JSON", async () => {
    mockFetchOnceRaw(502, "Host not in allowlist");

    let caught: unknown;
    try {
      await createOrder({
        purchase_country: "SE",
        purchase_currency: "SEK",
        locale: "sv-SE",
        order_amount: 0,
        order_tax_amount: 0,
        order_lines: [],
        merchant_urls: { terms: "t", checkout: "c", confirmation: "conf", push: "p", validation: "v" },
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(KustomApiError);
    expect((caught as KustomApiError).status).toBe(502);
  });

  it("kastar KustomApiError vid icke-2xx-svar", async () => {
    mockFetchOnce(422, { error_code: "INVALID_ORDER" });

    await expect(
      createOrder({
        purchase_country: "SE",
        purchase_currency: "SEK",
        locale: "sv-SE",
        order_amount: 0,
        order_tax_amount: 0,
        order_lines: [],
        merchant_urls: { terms: "t", checkout: "c", confirmation: "conf", push: "p", validation: "v" },
      }),
    ).rejects.toBeInstanceOf(KustomApiError);
  });
});

describe("readOrder / updateOrder", () => {
  it("GET:ar rätt path för readOrder", async () => {
    const fetchMock = mockFetchOnce(200, { order_id: "abc123" });
    await readOrder("abc123");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.playground.kustom.co/checkout/v3/orders/abc123");
    expect(init.method).toBeUndefined();
  });

  it("POSTar till samma order-path för updateOrder", async () => {
    const fetchMock = mockFetchOnce(200, { order_id: "abc123" });
    await updateOrder("abc123", { order_amount: 500 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.playground.kustom.co/checkout/v3/orders/abc123");
    expect(init.method).toBe("POST");
  });

  it("URL-kodar order-id", async () => {
    const fetchMock = mockFetchOnce(200, {});
    await readOrder("has space/slash");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain(encodeURIComponent("has space/slash"));
  });
});

describe("extractOrderId / extractHtmlSnippet", () => {
  it("läser order_id när det finns", () => {
    expect(extractOrderId({ order_id: "abc" })).toBe("abc");
  });

  it("faller tillbaka till id om order_id saknas", () => {
    expect(extractOrderId({ id: "xyz" })).toBe("xyz");
  });

  it("kastar tydligt om inget id hittas", () => {
    expect(() => extractOrderId({})).toThrow();
  });

  it("kastar tydligt om html_snippet saknas", () => {
    expect(() => extractHtmlSnippet({})).toThrow();
  });
});
