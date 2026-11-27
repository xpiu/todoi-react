import { expect, it } from "vitest";

import { findItemByRef, isProjectSlug, itemKeyNumber, itemLink, itemRef } from "./projectLinks";

it("tells a project slug from an app route or a database id", () => {
  expect(isProjectSlug("epd5vjxy38")).toBe(true);
  // No digit: it could be a word, or a route.
  expect(isProjectSlug("abcdefghij")).toBe(false);
  // o, 0, 1 and l are never used; nor are capitals.
  for (const value of ["epd5vjxyo8", "epd5vjxy08", "epd5vjxy18", "epd5vjxyl8", "Epd5vjxy38"]) expect(isProjectSlug(value)).toBe(false);
  for (const value of ["inbox", "settings", "account-deleted", "epd5vjxy3", "epd5vjxy388", "4ciZk5uN_y865ipTUQmOP"]) expect(isProjectSlug(value)).toBe(false);
});

it("reads the number behind an item key, and nothing from an id", () => {
  expect(itemKeyNumber("MP-102")).toBe(102);
  expect(itemKeyNumber("mp-7")).toBe(7);
  for (const ref of ["MP-0", "MP-", "MP102", "M-1", "TOOLONG-1", "7SpNP1vU6eJE33e-_VnC0", ""]) expect(itemKeyNumber(ref)).toBeNull();
});

it("names an item by its key, or by its id while it has none", () => {
  expect(itemRef({ id: "a", keyNumber: 102 }, "MP")).toBe("MP-102");
  expect(itemRef({ id: "a", keyNumber: null }, "MP")).toBe("a");
});

it("finds an item by id or key, whatever prefix the link carries", () => {
  const items = [{ id: "first", keyNumber: 1 }, { id: "second", keyNumber: 102 }, { id: "AB-1", keyNumber: null }];
  expect(findItemByRef(items, "second")?.id).toBe("second");
  expect(findItemByRef(items, "MP-102")?.id).toBe("second");
  expect(findItemByRef(items, "OLD-102")?.id).toBe("second");
  // An id that looks like a key is still an id first.
  expect(findItemByRef(items, "AB-1")?.id).toBe("AB-1");
  expect(findItemByRef(items, "MP-9")).toBeUndefined();
});

it("builds an item's link over its project, or in the Inbox", () => {
  expect(itemLink("https://todoi.com/", { id: "a", keyNumber: 102 }, { slug: "epd5vjxy38", keyPrefix: "MP" })).toBe("https://todoi.com/epd5vjxy38?item=MP-102");
  expect(itemLink("https://todoi.com", { id: "a", keyNumber: null }, { slug: "epd5vjxy38", keyPrefix: "MP" })).toBe("https://todoi.com/epd5vjxy38?item=a");
  expect(itemLink("https://todoi.com", { id: "a", keyNumber: 3 }, null)).toBe("https://todoi.com/inbox?item=a");
});
