import { describe, expect, it, vi } from "vitest";

import { undoneMessage } from "../design/core/undoStack";
import { snapshotUndo } from "./snapshotUndo";

describe("snapshot undo feedback", () => {
  it.each(["HIGH", "LOW", "MEDIUM"])("names only later priority values it overwrites (%s)", async (priority) => {
    const restore = vi.fn().mockResolvedValue(undefined);
    const undo = snapshotUndo([{ id: "item", before: { priority: "HIGH" }, after: { priority: "LOW" }, restore }], async () => ({ priority, title: "A later title" }));
    const result = await undo();
    expect(result.revertedFields).toEqual(priority === "MEDIUM" ? ["priority"] : []);
    expect(restore).toHaveBeenCalledOnce();
    expect(undoneMessage({ message: "Changed priority", restore }, result)).toContain(priority === "MEDIUM" ? "also reverted later edits to priority" : "Undid: changed priority");
  });

  it("ignores relation ordering, but detects newly added relations", async () => {
    const steps = [{ id: "item", before: { labelIds: [] }, after: { labelIds: ["a", "b"] }, restore: vi.fn().mockResolvedValue(undefined) }];
    expect((await snapshotUndo(steps, async () => ({ labelIds: ["b", "a"] }))()).revertedFields).toEqual([]);
    expect((await snapshotUndo(steps, async () => ({ labelIds: ["a", "b", "c"] }))()).revertedFields).toEqual(["labels"]);
  });

  it("retries unfinished steps and retains feedback from completed ones", async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(undefined);
    const undo = snapshotUndo([first, second].map((restore, i) => ({ id: String(i), before: { priority: "HIGH" }, after: { priority: "LOW" }, restore })), async () => ({ priority: "MEDIUM" }));
    await expect(undo()).rejects.toThrow("Offline");
    expect((await undo()).revertedFields).toEqual(["priority"]);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
  });
});
