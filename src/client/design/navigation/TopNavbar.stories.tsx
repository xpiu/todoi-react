import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import type { SearchSources } from "./SearchDropdown";
import { SubNavbar } from "./SubNavbar";
import { TopNavbar } from "./TopNavbar";

const SOURCES: SearchSources = {
  groups: [{ id: "g1", name: "Helicopters Europe", projects: [{}, {}] }],
  projects: [
    { id: "p1", name: "Helicopter sales", icon: "rocket", color: "var(--label-orange)", groupName: "Helicopters Europe" },
    { id: "p2", name: "Marketing site", icon: "globe", color: "var(--label-blue)", groupName: "Internal" },
  ],
  items: [{ id: "i1", projectId: "p1", itemId: "HE-115", title: "Prepare the helicopter quote", listName: "Doing" }],
  inbox: [{ id: "x1", projectId: null, title: "Call the helicopter insurer" }],
};

const meta = {
  title: "Navigation/TopNavbar",
  component: TopNavbar,
  args: {
    title: "Helicopter sales",
    onTitleChange: fn(),
    search: true,
    searchSources: SOURCES,
    onSearchSelect: fn(),
    onSearchChange: fn(),
    onCreate: fn(),
    user: { name: "Flo Zuallaert", email: "flo@todoi.com", avatarColor: "var(--label-teal)" },
    onOpenSettings: fn(),
    onOpenAccount: fn(),
    onLogout: fn(),
    onLogin: fn(),
    onCreateAccount: fn(),
    sidebarOpen: true,
    onToggleSidebar: fn(),
    sidebarSide: "right",
  },
  parameters: {
    // The bar spans the window; padded layout would misrepresent its edges.
    layout: "fullscreen",
    docs: { description: { component: "The always-visible chrome bar. The host owns the title, user, sidebar state and what each create kind does; the bar keeps only the rename draft and the search field's query, open state and recent picks, rendering SearchDropdown when `searchSources` is given. Children are the SubNavbar hoisted into the bar on desktop; `status` takes the ConnectionStatus." } },
  },
} satisfies Meta<typeof TopNavbar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Project: Story = {};
export const WithSubNavbar: Story = {
  args: { children: <SubNavbar activeView="board" projectUrl="https://todoi.app/p/helicopter-sales" /> },
};
export const RenameTitle: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Rename project: Helicopter sales" }));
    const field = canvas.getByRole("textbox", { name: "Project name" });
    await expect(field).toHaveFocus();
    await userEvent.clear(field);
    await userEvent.type(field, "Helicopter sales 2027{Enter}");
    await expect(args.onTitleChange).toHaveBeenCalledWith("Helicopter sales 2027");
  },
};
export const Search: Story = {
  async play({ args, canvas, userEvent }) {
    const field = canvas.getByRole("combobox", { name: "Search" });
    await expect(field).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(field);
    const results = await canvas.findByRole("listbox", { name: "Search results" });
    await waitFor(() => expect(results).toBeVisible());
    // The field drives the dropdown: it controls the listbox and points at the highlighted option.
    const first = within(results).getByRole("option", { name: /Helicopter sales/ });
    await expect(field).toHaveAttribute("aria-expanded", "true");
    await expect(field).toHaveAttribute("aria-controls", results.id);
    await expect(field).toHaveAttribute("aria-activedescendant", first.id);
    await userEvent.keyboard("{ArrowDown}");
    await expect(field).toHaveAttribute("aria-activedescendant", within(results).getByRole("option", { name: /Marketing site/ }).id);
    await userEvent.type(field, "zeppelin");
    await expect(canvas.getByRole("status")).toHaveTextContent("No projects or items match “zeppelin”");
    await expect(field).toHaveAttribute("aria-expanded", "false");
    await expect(field).not.toHaveAttribute("aria-activedescendant");
    await userEvent.clear(field);
    await userEvent.type(field, "quote");
    await expect(args.onSearchChange).toHaveBeenLastCalledWith("quote", true);
    await expect(field).toHaveAttribute("aria-activedescendant", canvas.getByRole("option", { name: /HE-115/ }).id);
    await userEvent.keyboard("{Enter}");
    await expect(args.onSearchSelect).toHaveBeenCalledWith("item", "i1", expect.objectContaining({ itemId: "HE-115" }));
    await waitFor(() => expect(canvas.queryByRole("listbox")).not.toBeInTheDocument());
    await expect(field).toHaveValue("");
  },
};
export const CreateMenu: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Create" }));
    await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Create a list" }));
    await expect(args.onCreate).toHaveBeenCalledWith("list");
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const AccountMenu: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Account: Flo Zuallaert" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Log out" }));
    await expect(args.onLogout).toHaveBeenCalledOnce();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const Guest: Story = {
  args: { signedIn: false, user: { name: "Guest" }, onTitleChange: undefined },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Account (not signed in)" }));
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByText("Not signed in")).toBeInTheDocument();
    await userEvent.click(page.getByRole("menuitem", { name: "Create account" }));
    await expect(args.onCreateAccount).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const SidebarLeft: Story = {
  args: { sidebarSide: "left", sidebarOpen: false },
  async play({ args, canvas, userEvent }) {
    const toggle = canvas.getByRole("button", { name: "Show sidebar" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await expect(args.onToggleSidebar).toHaveBeenCalledWith(true);
  },
};
export const LongTitle: Story = { args: { title: "Helicopter sales and after-market maintenance contracts for Belgium, the Netherlands and Luxembourg" } };
