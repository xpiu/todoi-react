import { describe, expect, it } from "vitest";

import { connectionCopy, relativeSync } from "./ConnectionStatus";

describe("sync status data safety", () => {
  it("assures durable offline changes survive closure without claiming server sync", () => {
    const copy = connectionCopy({ online: false, pending: 2 });
    expect(copy.message).toContain("saved on this device");
    expect(copy.detail).toContain("survive closing this tab");
    expect(copy.detail).toContain("No sync completed yet");
    expect(copy.detail).not.toContain("discards");
  });

  it("keeps recovery discoverable when offline and failed changes coexist", () => {
    const copy = connectionCopy({ online: false, pending: 1, failed: 1 });
    expect(copy.label).toBe("1 need review");
    expect(copy.detail).toContain("drafts are saved on this device");
    expect(copy.detail).toContain("Storage & sync");
  });

  it("never promises device safety after a storage failure", () => {
    const copy = connectionCopy({ online: false, pending: 2, failed: 1, storageError: "Quota exceeded" });
    expect(copy.label).toBe("Device save failed");
    expect(copy.detail).toContain("Keep this tab open");
    expect(copy.detail).not.toContain("survive");
  });

  it("separates unsupported transient actions from durable workspace changes", () => {
    const copy = connectionCopy({ online: false, pending: 2, transientPending: 1 });
    expect(copy.message).toBe("1 edit waiting in this tab");
    expect(copy.detail).toContain("Keep this tab open");
    expect(copy.detail).toContain("saved separately on this device");
  });

  it("describes server acknowledgement as sync rather than a device save", () => {
    expect(relativeSync("2026-10-06T00:00:00Z", Date.parse("2026-10-06T00:02:00Z"))).toBe("Last synced 2 minutes ago");
  });
});
