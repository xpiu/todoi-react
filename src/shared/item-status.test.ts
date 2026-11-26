import { describe, expect, it } from "vitest";

import { suggestedRoleForTitle } from "./item-status";

describe("suggestedRoleForTitle", () => {
  it("reads Status words in list titles", () => {
    expect(suggestedRoleForTitle("New")).toBe("NEW");
    expect(suggestedRoleForTitle("New requests")).toBe("NEW");
    expect(suggestedRoleForTitle("Inbox")).toBe("NEW");
    expect(suggestedRoleForTitle("To-do")).toBe("TODO");
    expect(suggestedRoleForTitle("In progress")).toBe("DOING");
    expect(suggestedRoleForTitle("Done")).toBe("DONE");
    expect(suggestedRoleForTitle("Backlog")).toBe("BACKLOG");
    expect(suggestedRoleForTitle("Waiting on client")).toBeNull();
  });

  it("gives a just-added list's placeholder name no role, so Colorize gives it a pool tint", () => {
    // The app names a new list "List <n>"; Design's kit names it "New list", "New list 2"
    for (const name of ["List 3", "list", "New list", "New list 2", " new LIST 12 "]) expect(suggestedRoleForTitle(name)).toBeNull();
    // A title that only starts like one still reads its Status word
    expect(suggestedRoleForTitle("New list of requests")).toBe("NEW");
    expect(suggestedRoleForTitle("New lists")).toBe("NEW");
  });
});
