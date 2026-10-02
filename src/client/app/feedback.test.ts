import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFeedback } from "./feedback";

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

beforeEach(() => useFeedback.setState({ toast: null, stack: [], scope: "project", undoing: null }));

describe("confirmed undo", () => {
  it("keeps the entry pending, and ignores repeated Undo until it succeeds", async () => {
    const task = deferred();
    const restore = vi.fn(() => task.promise);
    useFeedback.getState().notify({ message: "Deleted item", restore });
    const undo = useFeedback.getState().undo();
    await useFeedback.getState().undo();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(useFeedback.getState().stack).toHaveLength(1);
    expect(useFeedback.getState().toast?.message).toBe("Undoing…");
    task.resolve();
    await undo;
    expect(useFeedback.getState().stack).toHaveLength(0);
    expect(useFeedback.getState().toast?.message).toBe("Undid: deleted item");
  });

  it("keeps failed restores retryable", async () => {
    const restore = vi.fn().mockRejectedValueOnce(new Error("Forbidden")).mockResolvedValue(undefined);
    useFeedback.getState().notify({ message: "Deleted item", restore });
    await useFeedback.getState().undo();
    expect(useFeedback.getState().stack).toHaveLength(1);
    expect(useFeedback.getState().toast?.actionLabel).toBe("Retry Undo");
    await useFeedback.getState().undo();
    expect(restore).toHaveBeenCalledTimes(2);
    expect(useFeedback.getState().stack).toHaveLength(0);
  });

  it("also retains history after a synchronous restore error", async () => {
    useFeedback.getState().notify({ message: "Deleted item", restore: () => { throw new Error("Failed"); } });
    await useFeedback.getState().undo();
    expect(useFeedback.getState().stack).toHaveLength(1);
    expect(useFeedback.getState().undoing).toBeNull();
  });

  it("preserves a newer outcome that arrives during restoration", async () => {
    const task = deferred();
    useFeedback.getState().notify({ message: "Deleted first", restore: () => task.promise });
    const undo = useFeedback.getState().undo();
    useFeedback.getState().notify({ message: "Deleted second", restore: vi.fn() });
    task.resolve();
    await undo;
    expect(useFeedback.getState().stack.map((e) => e.message)).toEqual(["Deleted second"]);
    expect(useFeedback.getState().toast?.message).toBe("Deleted second");
  });

  it.each([false, true])("does not overwrite the next screen when a pending restore settles (failure=%s)", async (fail) => {
    const task = deferred();
    useFeedback.getState().notify({ message: "Deleted first", restore: () => task.promise });
    const undo = useFeedback.getState().undo();
    useFeedback.getState().setScope("another project");
    useFeedback.getState().notify({ message: "New screen" });
    if (fail) task.reject(new Error("Failed")); else task.resolve();
    await undo;
    expect(useFeedback.getState().stack).toEqual([]);
    expect(useFeedback.getState().toast?.message).toBe("New screen");
  });

  it("supports existing synchronous restore callbacks", async () => {
    const restore = vi.fn();
    useFeedback.getState().notify({ message: "Moved item", restore });
    await useFeedback.getState().undo();
    expect(restore).toHaveBeenCalledOnce();
    expect(useFeedback.getState().stack).toEqual([]);
  });

  it("preserves outcome messages across navigation while dropping their old Undo action", () => {
    useFeedback.getState().notify({ message: "Created project", restore: vi.fn() });
    useFeedback.getState().setScope("new project");
    expect(useFeedback.getState().toast?.message).toBe("Created project");
    expect(useFeedback.getState().toast?.undo).toBeUndefined();
    expect(useFeedback.getState().stack).toEqual([]);
  });
});
