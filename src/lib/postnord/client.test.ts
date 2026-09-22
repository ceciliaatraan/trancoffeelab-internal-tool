import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostnordApiError, shortPostnordStatusLabel, trackPostnordShipment } from "./client";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.POSTNORD_API_KEY = "test-api-key";
  process.env.POSTNORD_API_HOST = "https://api2.postnord.com";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

function mockFetchOnce(ok: boolean, status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const DELIVERED_RESPONSE = {
  TrackingInformationResponse: {
    shipments: [
      {
        shipmentId: "96932007555SE",
        status: "DELIVERED",
        statusText: {
          header: "The shipment has been delivered to the recipient",
          body: "The shipment was delivered on 9/8/2020 at 7:18 PM",
        },
        deliveryDate: "2020-09-08T19:18:00",
        items: [
          {
            itemId: "96932007555SE",
            status: "DELIVERED",
            statusText: {
              header: "The shipment item has been delivered to the recipient",
              body: "The shipment item was delivered on 9/8/2020 at 7:18 PM",
            },
            deliveryDate: "2020-09-08T19:18:00",
            events: [
              {
                eventTime: "2020-09-08T19:18:00",
                eventCode: "21",
                status: "DELIVERED",
                eventDescription: "The shipment item has been delivered",
                location: { displayName: "LIDINGÖ", city: "LIDINGÖ", country: "Sweden" },
              },
            ],
          },
        ],
      },
    ],
  },
};

describe("trackPostnordShipment", () => {
  it("GETar findByIdentifier med apikey och id som query-parametrar", async () => {
    const fetchMock = mockFetchOnce(true, 200, DELIVERED_RESPONSE);

    await trackPostnordShipment("96932007555SE");

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/rest/shipment/v5/trackandtrace/findByIdentifier.json");
    expect(calledUrl).toContain("apikey=test-api-key");
    expect(calledUrl).toContain("id=96932007555SE");
  });

  it("tolkar ett levererat skickning korrekt", async () => {
    mockFetchOnce(true, 200, DELIVERED_RESPONSE);

    const result = await trackPostnordShipment("96932007555SE");

    expect(result).not.toBeNull();
    expect(result?.status).toBe("DELIVERED");
    expect(result?.deliveryDate).toBe("2020-09-08T19:18:00");
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0].events).toHaveLength(1);
  });

  it("returnerar null om PostNord inte hittar någon skickning (t.ex. inte ett riktigt spårningsnummer)", async () => {
    mockFetchOnce(true, 200, {
      TrackingInformationResponse: {
        compositeFault: { faults: [{ faultCode: "notFound", explanationText: "Not found" }] },
        shipments: [],
      },
    });

    const result = await trackPostnordShipment("(ingen spårning)");

    expect(result).toBeNull();
  });

  it("kastar PostnordApiError vid ett icke-OK HTTP-svar", async () => {
    mockFetchOnce(false, 403, {});

    await expect(trackPostnordShipment("96932007555SE")).rejects.toThrow(PostnordApiError);
  });

  it("kastar PostnordApiError om POSTNORD_API_KEY saknas", async () => {
    delete process.env.POSTNORD_API_KEY;

    await expect(trackPostnordShipment("96932007555SE")).rejects.toThrow(PostnordApiError);
  });
});

describe("shortPostnordStatusLabel", () => {
  it("översätter kända statusvärden till korta svenska etiketter", () => {
    expect(shortPostnordStatusLabel("DELIVERED")).toBe("Levererad");
    expect(shortPostnordStatusLabel("EN_ROUTE")).toBe("Under transport");
    expect(shortPostnordStatusLabel("OTHER")).toBe("Info");
  });

  it("visar okända statusvärden som de är, i stället för en gissad översättning", () => {
    expect(shortPostnordStatusLabel("AWAITING_PICKUP")).toBe("AWAITING_PICKUP");
  });
});
