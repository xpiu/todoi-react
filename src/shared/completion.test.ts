import { describe, expect, it } from "vitest";

import { applyCompletion, complete, reopen, statusChange, type CompletionFields } from "./completion";

const open = (over: Partial<CompletionFields> = {}): CompletionFields => ({ status: "DOING", priorStatus: null, done: false, dueDate: null, repeatRule: null, repeatCount: 0, ...over });

describe("status invariant", () => {
  it("Done means done and remembers the Status to reopen with", () => {
    expect(statusChange(open(), "DONE")).toEqual({ status: "DONE", done: true, priorStatus: "DOING" });
    expect(reopen({ status: "DONE", done: true, priorStatus: "DOING" })).toEqual({ status: "DOING", done: false, priorStatus: null });
  });
  it("is idempotent: marking a done item done keeps what it reopens to", () => {
    const done = statusChange(open(), "DONE");
    expect(statusChange(done, "DONE")).toEqual(done);
    expect(complete({ ...open(), ...done }).patch).toEqual(done);
  });
  it("any other Status reopens and forgets", () => {
    expect(statusChange({ status: "DONE", done: true, priorStatus: "DOING" }, "TODO")).toEqual({ status: "TODO", done: false, priorStatus: null });
  });
  it("never reopens into Done", () => {
    expect(reopen({ status: "DONE", done: true, priorStatus: "DONE" })).toMatchObject({ status: null, done: false });
    expect(reopen({ status: "DONE", done: true, priorStatus: null })).toMatchObject({ status: null, done: false });
  });
});

describe("completing a recurring item", () => {
  const weekly = { freq: "weekly" as const, ends: { type: "after" as const, count: 2 } };
  it("moves an open item to its next due and keeps it open", () => {
    const r = complete(open({ dueDate: "2026-09-12", repeatRule: weekly }));
    expect(r).toEqual({ patch: { dueDate: "2026-09-19", repeatCount: 1 }, occurrence: { from: "2026-09-12", next: "2026-09-19", count: 1, ended: false } });
  });
  it("is done on its last occurrence", () => {
    const r = complete(open({ dueDate: "2026-09-19", repeatRule: weekly, repeatCount: 1 }));
    expect(r).toEqual({ patch: { status: "DONE", done: true, priorStatus: "DOING", repeatCount: 2 }, occurrence: { from: "2026-09-19", next: null, count: 2, ended: true } });
  });
  it("without a due it completes like any item", () => {
    expect(complete(open({ repeatRule: weekly })).occurrence).toBeNull();
  });
});

describe("applyCompletion", () => {
  const daily = { freq: "daily" as const };
  it("done: true completes; a Done Status is literal", () => {
    expect(applyCompletion(open({ dueDate: "2026-09-12", repeatRule: daily }), { done: true }).patch).toEqual({ dueDate: "2026-09-13", repeatCount: 1 });
    expect(applyCompletion(open({ dueDate: "2026-09-12", repeatRule: daily }), { status: "DONE" })).toEqual({ patch: { status: "DONE", done: true, priorStatus: "DOING" }, occurrence: null });
  });
  it("done: false reopens, to an explicit Status when one is given", () => {
    const done = open({ status: "DONE", done: true, priorStatus: "TODO" });
    expect(applyCompletion(done, { done: false }).patch).toEqual({ status: "TODO", done: false, priorStatus: null });
    expect(applyCompletion(done, { done: false, status: "BACKLOG" }).patch).toEqual({ status: "BACKLOG", done: false, priorStatus: null });
    expect(applyCompletion(done, {}).patch).toEqual({});
  });
});
