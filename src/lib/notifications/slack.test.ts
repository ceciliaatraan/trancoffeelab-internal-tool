import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCustomerLabel, notifyNewOrderInSlack } from "./slack";
import type { PersistedOrder } from "@/lib/orders/persist-order";

const ORIGINAL_ENV = { ...process.env };

const baseOrder: PersistedOrder = {
  id: "order-1",
  orderNumber: 1042,
  alreadyExisted: false,
  containsPreorder: false,
  physicalLines: [
    {
      name: "No Regrets Horse 250g",
      quantity: 2,
      isPreorder: false,
      expectedShipDate: null,
      imageUrl: null,
      lineTotalOre: 29800,
      slug: "no-regrets-horse-coffee",
    },
  ],
  shippingLine: null,
  discount: null,
};

beforeEach(() => {
  process.env.KUSTOM_ENV = "live";
  process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";
  process.env.NEXT_PUBLIC_ADMIN_URL = "https://admin.trancoffeelab.com";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

function mockFetch(ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, text: async () => "" });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("formatCustomerLabel", () => {
  it("kombinerar namn och e-post", () => {
    expect(formatCustomerLabel("Cecilia", "Tran", "cecilia@example.com")).toBe(
      "Cecilia Tran (cecilia@example.com)",
    );
  });

  it("faller tillbaka till bara namnet om e-post saknas", () => {
    expect(formatCustomerLabel("Cecilia", "Tran", null)).toBe("Cecilia Tran");
  });

  it("faller tillbaka till bara e-posten om namn saknas", () => {
    expect(formatCustomerLabel(null, null, "cecilia@example.com")).toBe("cecilia@example.com");
  });

  it("hanterar bara förnamn utan efternamn", () => {
    expect(formatCustomerLabel("Cecilia", null, null)).toBe("Cecilia");
  });

  it("returnerar null om varken namn eller e-post finns", () => {
    expect(formatCustomerLabel(null, undefined, null)).toBeNull();
  });
});

describe("notifyNewOrderInSlack", () => {
  it("POSTar till SLACK_WEBHOOK_URL med ordernummer, totalpris, kund och rader", async () => {
    const fetchMock = mockFetch();

    await notifyNewOrderInSlack(baseOrder, 29800, "Cecilia Tran (cecilia@example.com)");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/services/test");
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain("#1042");
    expect(body.text).toContain("298,00");
    expect(JSON.stringify(body)).toContain("No Regrets Horse 250g");
    expect(JSON.stringify(body)).toContain("Cecilia Tran (cecilia@example.com)");
    expect(JSON.stringify(body)).toContain("https://admin.trancoffeelab.com/orders/order-1");
  });

  it("utelämnar kundraden helt om customer är null", async () => {
    const fetchMock = mockFetch();

    await notifyNewOrderInSlack(baseOrder, 29800, null);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(JSON.stringify(body)).not.toContain("👤");
  });

  it("skickar INTE om KUSTOM_ENV inte är 'live' (playground-ordrar ska inte pinga kanalen)", async () => {
    process.env.KUSTOM_ENV = "playground";
    const fetchMock = mockFetch();

    await notifyNewOrderInSlack(baseOrder, 29800, "Cecilia Tran");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skickar INTE om SLACK_WEBHOOK_URL saknas", async () => {
    delete process.env.SLACK_WEBHOOK_URL;
    const fetchMock = mockFetch();

    await notifyNewOrderInSlack(baseOrder, 29800, "Cecilia Tran");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("kastar ALDRIG vidare om Slack svarar med fel", async () => {
    mockFetch(false);

    await expect(notifyNewOrderInSlack(baseOrder, 29800, "Cecilia Tran")).resolves.toBeUndefined();
  });

  it("kastar ALDRIG vidare om fetch självt kastar (nätverksfel)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(notifyNewOrderInSlack(baseOrder, 29800, "Cecilia Tran")).resolves.toBeUndefined();
  });

  it("markerar förbeställningar i meddelandet", async () => {
    const fetchMock = mockFetch();

    await notifyNewOrderInSlack({ ...baseOrder, containsPreorder: true }, 29800, "Cecilia Tran");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(JSON.stringify(body)).toContain("förbeställning");
  });

  it("visar rabattkod och rabattbelopp när en rabatt använts, och priset är det rabatterade totalbeloppet", async () => {
    const fetchMock = mockFetch();
    const orderWithDiscount: PersistedOrder = {
      ...baseOrder,
      discount: { code: "SOMMAR20", amountOre: 5000 },
    };

    // 29800 är redan Kustoms `order_amount` — det rabatterade totalbeloppet
    // kunden faktiskt betalade, inte listpriset före rabatt.
    await notifyNewOrderInSlack(orderWithDiscount, 29800, "Cecilia Tran");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.text).toContain("298,00");
    expect(JSON.stringify(body)).toContain("SOMMAR20");
    expect(JSON.stringify(body)).toContain("50,00");
  });

  it("utelämnar rabattraden helt om ingen rabatt användes", async () => {
    const fetchMock = mockFetch();

    await notifyNewOrderInSlack(baseOrder, 29800, "Cecilia Tran");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(JSON.stringify(body)).not.toContain("🏷️");
  });
});
