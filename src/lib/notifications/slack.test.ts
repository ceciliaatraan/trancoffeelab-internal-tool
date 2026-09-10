import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyNewOrderInSlack } from "./slack";
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

describe("notifyNewOrderInSlack", () => {
  it("POSTar till SLACK_WEBHOOK_URL med ordernummer, totalpris och rader", async () => {
    const fetchMock = mockFetch();

    await notifyNewOrderInSlack(baseOrder, 29800);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/services/test");
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain("#1042");
    expect(body.text).toContain("298,00");
    expect(JSON.stringify(body)).toContain("No Regrets Horse 250g");
    expect(JSON.stringify(body)).toContain("https://admin.trancoffeelab.com/orders/order-1");
  });

  it("skickar INTE om KUSTOM_ENV inte är 'live' (playground-ordrar ska inte pinga kanalen)", async () => {
    process.env.KUSTOM_ENV = "playground";
    const fetchMock = mockFetch();

    await notifyNewOrderInSlack(baseOrder, 29800);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skickar INTE om SLACK_WEBHOOK_URL saknas", async () => {
    delete process.env.SLACK_WEBHOOK_URL;
    const fetchMock = mockFetch();

    await notifyNewOrderInSlack(baseOrder, 29800);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("kastar ALDRIG vidare om Slack svarar med fel", async () => {
    mockFetch(false);

    await expect(notifyNewOrderInSlack(baseOrder, 29800)).resolves.toBeUndefined();
  });

  it("kastar ALDRIG vidare om fetch självt kastar (nätverksfel)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(notifyNewOrderInSlack(baseOrder, 29800)).resolves.toBeUndefined();
  });

  it("markerar förbeställningar i meddelandet", async () => {
    const fetchMock = mockFetch();

    await notifyNewOrderInSlack({ ...baseOrder, containsPreorder: true }, 29800);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(JSON.stringify(body)).toContain("förbeställning");
  });
});
