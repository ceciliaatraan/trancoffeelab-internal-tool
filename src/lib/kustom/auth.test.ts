import { describe, expect, it } from "vitest";
import { buildKustomAuthHeader } from "./auth";

describe("buildKustomAuthHeader", () => {
  it("kodar nyckeln som användarnamn utan lösenord när inget username ges", () => {
    const header = buildKustomAuthHeader({ apiKey: "kco_test_api_secret" });
    expect(header).toBe(`Basic ${Buffer.from("kco_test_api_secret:").toString("base64")}`);
  });

  it("kodar username:nyckel när username ges", () => {
    const header = buildKustomAuthHeader({
      apiKey: "kco_test_api_secret",
      username: "MID-1",
    });
    expect(header).toBe(
      `Basic ${Buffer.from("MID-1:kco_test_api_secret").toString("base64")}`,
    );
  });

  it("producerar giltig base64", () => {
    const header = buildKustomAuthHeader({ apiKey: "kco_live_api_abc123" });
    const [, encoded] = header.split(" ");
    expect(Buffer.from(encoded, "base64").toString("utf-8")).toBe("kco_live_api_abc123:");
  });
});
