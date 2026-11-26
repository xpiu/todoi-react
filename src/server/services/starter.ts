// A new account's first project on an invite-only server (SIGN_UP=invite, which makes no guest workspaces):
// a few items that teach Todoi by doing, so a tester has something real to click, drag and tick. Every shortcut and
// quick-add token here is one the app has (client/design/core/shortcuts.ts); deleting the project is fine.
import { nanoid } from "nanoid";

import type { ImportPlan } from "../../shared/import";
import { db } from "../db";
import { groups } from "../db/schema";
import { importProject } from "./projects";

export const STARTER_PROJECT = "Getting started";

export const STARTER_PLAN: ImportPlan = {
  name: STARTER_PROJECT,
  labels: [{ name: "tip", color: "blue" }],
  warnings: [],
  lists: [
    {
      name: "To-do",
      statusRole: "TODO",
      items: [
        {
          title: "Add an item: press N, type, press Enter",
          description: "Quick-add reads a few tokens as you type, and the line under the field previews them:\n\n- `#label` adds a label (a new name makes a new label)\n- `@name` assigns someone by first name or handle\n- `!1` to `!4` sets the priority (or `!urgent`, `!high`…)\n- `due fri`, `due tomorrow`, `due 12 dec` sets the due date\n- `>Doing` puts the item in another list\n\nTry `Plan the week #tip !2 due fri >Doing`. Enter adds it and keeps the field open for the next one.",
          labels: ["tip"],
          done: false,
          subitems: [],
        },
        {
          title: "Open an item to see everything about it",
          description: "Click an item, or focus it and press Enter. Its page has a description (this text), a checklist, dates, people, labels and comments. The key in its corner (like PRO-2) is a short reference you can search for or mention.\n\nTick the checklist below, then leave a comment.",
          labels: ["tip"],
          done: false,
          subitems: [
            { title: "Tick this step", done: false },
            { title: "And this one", done: false },
          ],
        },
        {
          title: "Work from the keyboard: J and K, then D",
          description: "J and K move down and up a list, the arrows move between lists, D marks the focused item done and 1–4 set its priority. Press ? for every shortcut.",
          labels: ["tip"],
          priority: "MEDIUM",
          done: false,
          subitems: [],
        },
        {
          title: "Drag me to Doing: the Status follows the list",
          description: "Each list can set the Status of what lands in it: here To-do, Doing and Done do. Drag this item to Doing (or press Ctrl + →) and its Status changes with it; in Done it counts as done.",
          labels: ["tip"],
          done: false,
          subitems: [],
        },
        {
          title: "See the same items as a Board and on a Calendar",
          description: "The tabs above switch views: List, Board and Calendar (or G then L, B, C). A filter you use often can be kept as a saved view.",
          labels: ["tip"],
          done: false,
          subitems: [],
        },
      ],
    },
    {
      name: "Doing",
      statusRole: "DOING",
      items: [
        {
          title: "Made a mistake? Press Z to undo",
          description: "Z (or Ctrl + Z) undoes the last change, up to 10 back: a delete, a move, a bulk edit.",
          labels: ["tip"],
          done: false,
          subitems: [],
        },
        {
          title: "Delete this project when you're done with it",
          description: "Project menu › Delete. It stays in the Trash for 90 days, so nothing is lost by accident. Start your own from the + next to Projects.",
          labels: ["tip"],
          done: false,
          subitems: [],
        },
      ],
    },
    {
      name: "Done",
      statusRole: "DONE",
      items: [{ title: "Open Todoi", labels: [], done: true, subitems: [] }],
    },
  ],
};

/** A new person's workspace: one group with the Getting started project. */
export async function createStarterWorkspace(userId: string) {
  const groupId = nanoid();
  await db.insert(groups).values({ id: groupId, ownerId: userId, name: "Projects", keyPrefix: "PRO" });
  await importProject({ id: nanoid(), groupId, name: STARTER_PROJECT, plan: STARTER_PLAN }, userId);
}
