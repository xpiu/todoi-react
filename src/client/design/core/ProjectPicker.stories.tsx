import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "./Button";
import { ProjectPicker, TransferDialog, type PickableList, type PickableProject, type TransferKind } from "./ProjectPicker";

const SALES_LISTS: PickableList[] = [
  { id: "s1", name: "To-do" },
  { id: "s2", name: "Doing" },
  { id: "s3", name: "Done" },
];
const PROJECTS: PickableProject[] = [
  { id: "p1", name: "Helicopters Europe", icon: "rocket", color: "var(--label-blue)", group: "Sales", lists: SALES_LISTS },
  { id: "p2", name: "Hangar renovation", icon: "wrench", color: "var(--label-orange)", group: "Operations" },
  { id: "p3", name: "Empty project", group: "Operations", lists: [] },
  { id: "p4", name: "Current project", group: "Sales", lists: SALES_LISTS },
];
const LOADED: PickableList[] = [{ id: "h1", name: "Backlog" }, { id: "h2", name: "Contractors", icon: "wrench" }];

const meta = {
  title: "Core/ProjectPicker",
  component: ProjectPicker,
  // Panel body only; TransferDialog (below) is the app's dialog around it.
  decorators: [(Story) => <div className="td-pop" style={{ width: 340, position: "static" }}><Story /></div>],
  args: { projects: PROJECTS, current: "p4", onPick: fn(), loadLists: fn(async () => LOADED) },
  parameters: { docs: { description: { component: "Move or copy items to another project: pick the project (searchable, `current` excluded), then the destination list. Panel body only; TransferDialog wraps it in the Move/Copy dialog. Lists come from each project's `lists` or from the async loadLists(projectId). onPick(project, list) fires once and the caller performs the transfer and raises one toast." } } },
} satisfies Meta<typeof ProjectPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PickProjectAndList: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.queryByRole("option", { name: /Current project/ })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("option", { name: /Helicopters Europe/ }));
    await expect(canvas.getByRole("listbox", { name: "Lists in Helicopters Europe" })).toBeVisible();
    await userEvent.click(canvas.getByRole("option", { name: "Doing" }));
    await expect(args.onPick).toHaveBeenCalledWith(PROJECTS[0], SALES_LISTS[1]);
  },
};
export const LoadsLists: Story = {
  async play({ args, canvas, userEvent }) {
    const search = canvas.getByRole("combobox", { name: "Search projects…" });
    await expect(search).toHaveFocus();
    await userEvent.type(search, "operations");
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    await expect(args.loadLists).toHaveBeenCalledWith("p2");
    await canvas.findByRole("option", { name: "Backlog" });
    const lists = canvas.getByRole("listbox", { name: "Lists in Hangar renovation" });
    await expect(lists).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    const contractors = canvas.getByRole("option", { name: "Contractors" });
    await expect(contractors).toHaveAttribute("aria-selected", "true");
    await expect(lists).toHaveAttribute("aria-activedescendant", contractors.id);
    await userEvent.keyboard("{ArrowUp} ");
    await expect(args.onPick).toHaveBeenCalledWith(PROJECTS[1], LOADED[0]);
    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    await expect(canvas.getByRole("listbox", { name: "Move to project" })).toBeVisible();
    await expect(canvas.getByRole("combobox", { name: "Search projects…" })).toHaveFocus();
  },
};
export const KeyboardHighlight: Story = {
  async play({ canvas, userEvent }) {
    const search = canvas.getByRole("combobox", { name: "Search projects…" });
    // One active option driven from the field; the rows are not separate Tab stops.
    await expect(canvas.getAllByRole("option").filter((o) => o.tabIndex >= 0)).toHaveLength(0);
    await userEvent.keyboard("{ArrowDown}");
    const hangar = canvas.getByRole("option", { name: /Hangar renovation/ });
    await expect(hangar).toHaveAttribute("aria-selected", "true");
    await expect(search).toHaveAttribute("aria-activedescendant", hangar.id);
    await userEvent.keyboard("{Enter}");
    await expect(await canvas.findByRole("listbox", { name: "Lists in Hangar renovation" })).toBeVisible();
  },
};
export const ProjectWithoutLists: Story = {
  async play({ canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("option", { name: /Empty project/ }));
    await expect(canvas.getByText("This project has no lists yet.")).toBeVisible();
    await expect(canvas.queryByRole("listbox")).not.toBeInTheDocument();
  },
};
export const Copy: Story = { args: { action: "copy", count: 3 } };
export const NoMatches: Story = {
  async play({ canvas, userEvent }) {
    const search = canvas.getByRole("combobox", { name: "Search projects…" });
    await userEvent.type(search, "zeppelin");
    await expect(canvas.getByText("No projects match")).toBeVisible();
    await expect(canvas.queryByRole("listbox")).not.toBeInTheDocument();
    await expect(search).toHaveAttribute("aria-expanded", "false");
  },
};
export const InTransferDialog: Story = {
  decorators: [],
  render: (args) => {
    const [kind, setKind] = useState<TransferKind | null>(null);
    return <>
      <Button onClick={() => setKind("copy")}>Copy to project…</Button>
      <TransferDialog kind={kind} onClose={() => setKind(null)} projects={args.projects} current={args.current} loadLists={args.loadLists} onPick={(_kind, project, list) => args.onPick(project, list)} />
    </>;
  },
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Copy to project…" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Copy to project" });
    await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Search projects…" })).toHaveFocus());
    await userEvent.click(within(dialog).getByRole("option", { name: /Helicopters Europe/ }));
    await userEvent.click(within(dialog).getByRole("option", { name: "Done" }));
    await expect(args.onPick).toHaveBeenCalledWith(PROJECTS[0], SALES_LISTS[2]);
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
