import { describe, expect, it } from "vitest";
import {
  buildPostnordExportCsv,
  buildPostnordOrderRow,
  POSTNORD_EXPORT_COLUMNS,
  type PostnordExportOrder,
} from "./postnord-export";

const baseOrder: PostnordExportOrder = {
  orderNumber: 1042,
  customerEmail: "cecilia@example.com",
  shippingAddress: {
    given_name: "Cecilia",
    family_name: "Tran",
    email: "cecilia@example.com",
    phone: "+46701234567",
    street_address: "Vanadisvägen 26b",
    postal_code: "113 46",
    city: "Stockholm",
    country: "se",
  },
};

describe("buildPostnordOrderRow", () => {
  it("mappar fälten till PostNords kolumner i exakt rätt ordning", () => {
    const row = buildPostnordOrderRow(baseOrder);
    const fields = row.split(";").map((f) => f.slice(1, -1)); // strip quotes

    expect(fields).toEqual([
      "Cecilia Tran",
      "",
      "",
      "cecilia@example.com",
      "+46701234567",
      "Vanadisvägen 26b",
      "",
      "",
      "113 46",
      "Stockholm",
      "SE",
      "",
      "",
      "",
      "TRAN #1042",
      "",
      "",
    ]);
  });

  it("faller tillbaka på order.customerEmail om adressens email saknas", () => {
    const row = buildPostnordOrderRow({
      ...baseOrder,
      shippingAddress: { ...baseOrder.shippingAddress, email: undefined },
    });
    expect(row).toContain('"cecilia@example.com"');
  });

  it("hanterar null shippingAddress utan att kasta", () => {
    const row = buildPostnordOrderRow({ ...baseOrder, shippingAddress: null });
    const fields = row.split(";").map((f) => f.slice(1, -1));
    expect(fields[0]).toBe(""); // inget namn
    expect(fields[10]).toBe("SE"); // default landskod
  });

  it("citerar och escapar citattecken i fält (t.ex. adress med \")", () => {
    const row = buildPostnordOrderRow({
      ...baseOrder,
      shippingAddress: { ...baseOrder.shippingAddress, street_address: 'Lgh "B"' },
    });
    expect(row).toContain('"Lgh ""B"""');
  });

  it("versaliserar landskoden", () => {
    const row = buildPostnordOrderRow({
      ...baseOrder,
      shippingAddress: { ...baseOrder.shippingAddress, country: "dk" },
    });
    const fields = row.split(";").map((f) => f.slice(1, -1));
    expect(fields[10]).toBe("DK");
  });
});

describe("buildPostnordExportCsv", () => {
  it("börjar med BOM och PostNords exakta kolumnrubriker", () => {
    const csv = buildPostnordExportCsv([baseOrder]);
    expect(csv.startsWith("﻿")).toBe(true);
    const withoutBom = csv.slice(1);
    const [headerLine] = withoutBom.split("\r\n");
    const headers = headerLine.split(";").map((f) => f.slice(1, -1));
    expect(headers).toEqual([...POSTNORD_EXPORT_COLUMNS]);
  });

  it("lägger en rad per order, i samma ordning som indata", () => {
    const csv = buildPostnordExportCsv([
      baseOrder,
      { ...baseOrder, orderNumber: 1043, customerEmail: "annan@example.com", shippingAddress: null },
    ]);
    expect(csv).toContain("TRAN #1042");
    expect(csv).toContain("TRAN #1043");
    const orderOf1042 = csv.indexOf("TRAN #1042");
    const orderOf1043 = csv.indexOf("TRAN #1043");
    expect(orderOf1042).toBeLessThan(orderOf1043);
  });

  it("returnerar bara header + radbrytning för en tom lista", () => {
    const csv = buildPostnordExportCsv([]);
    const withoutBom = csv.slice(1);
    expect(withoutBom.split("\r\n")).toEqual([csv.slice(1).split("\r\n")[0], ""]);
  });
});
