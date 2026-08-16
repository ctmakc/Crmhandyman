import { describe, it, expect, afterEach, vi } from "vitest";
import { slugFromHost } from "@/lib/tenant-slug";

/**
 * The one rule that turns an address into a workspace, shared by the middleware and the
 * login form. The dangerous case is CRM_HOME_HOST: the product's own front door is a
 * subdomain, and before the guard the first-label rule read it as workspace «crm» —
 * so login on the home address was checked against a tenant that doesn't exist.
 *
 * The env var is read on every call, which is what lets these tests set and unset it;
 * the same property is what lets one build serve different deployments.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("slugFromHost without CRM_HOME_HOST", () => {
  // Deployments predate the variable; unset must mean byte-for-byte today's behavior.
  it("reads the first label of a three-part host as the workspace", () => {
    expect(slugFromHost("acme.handymanpro.ca")).toBe("acme");
  });

  it("treats a bare apex as the demo workspace", () => {
    expect(slugFromHost("handymanpro.ca")).toBe("demo");
  });

  it("treats localhost as the demo workspace, with or without a port", () => {
    expect(slugFromHost("localhost")).toBe("demo");
    expect(slugFromHost("localhost:3000")).toBe("demo");
  });

  it("does not mistake www for a workspace", () => {
    expect(slugFromHost("www.handymanpro.ca")).toBe("demo");
  });

  it("lets an explicit override win over the host", () => {
    expect(slugFromHost("acme.handymanpro.ca", "beta")).toBe("beta");
  });
});

describe("slugFromHost with CRM_HOME_HOST", () => {
  it("serves the home host as the demo workspace instead of reading «crm» as a slug", () => {
    vi.stubEnv("CRM_HOME_HOST", "crm.agintent.com");
    expect(slugFromHost("crm.agintent.com")).toBe("demo");
  });

  it("matches the home host regardless of letter case and port", () => {
    // Host headers are case-insensitive on the wire, and the port is whatever sits in
    // front of the app — neither may turn the front door back into workspace «crm».
    vi.stubEnv("CRM_HOME_HOST", "crm.agintent.com");
    expect(slugFromHost("CRM.Agintent.COM")).toBe("demo");
    expect(slugFromHost("crm.agintent.com:3000")).toBe("demo");
  });

  it("still reads sibling subdomains of the home host's parent as workspaces", () => {
    vi.stubEnv("CRM_HOME_HOST", "crm.agintent.com");
    expect(slugFromHost("acme.agintent.com")).toBe("acme");
  });

  it("leaves every other address alone: apex, localhost, www, foreign subdomains", () => {
    vi.stubEnv("CRM_HOME_HOST", "crm.agintent.com");
    expect(slugFromHost("agintent.com")).toBe("demo");
    expect(slugFromHost("localhost:3000")).toBe("demo");
    expect(slugFromHost("www.agintent.com")).toBe("demo");
    expect(slugFromHost("acme.handymanpro.ca")).toBe("acme");
  });

  it("ignores a port mistakenly written into the variable itself", () => {
    vi.stubEnv("CRM_HOME_HOST", "crm.agintent.com:3000");
    expect(slugFromHost("crm.agintent.com")).toBe("demo");
  });
});

describe("reserved labels", () => {
  it("keeps infrastructure first labels out of the slug rule", () => {
    expect(slugFromHost("crm.agintent.com")).toBe("demo");
    expect(slugFromHost("api.agintent.com")).toBe("demo");
    expect(slugFromHost("CRM.agintent.com")).toBe("demo");
  });

  it("still reads a workspace next to a reserved label", () => {
    expect(slugFromHost("korvex.agintent.com")).toBe("korvex");
  });
});
