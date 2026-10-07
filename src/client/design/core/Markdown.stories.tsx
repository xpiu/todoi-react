import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { Markdown } from "./Markdown";

const MEMBERS = [{ name: "Flo Zuallaert", nickname: "flo" }, { name: "Sam Verhoeven" }];

const meta = {
  title: "Core/Markdown",
  component: Markdown,
  decorators: [(Story) => <div style={{ maxWidth: 560 }}><Story /></div>],
  args: {
    members: MEMBERS,
    onOpenKey: fn(),
    text: "# Launch plan\nEverything before the shop goes live. @flo takes the pages, see MP-112.\n\n- [x] Get the list from both dealers\n- [ ] Decide which models we sell **online**\n\n> Both dealers want the price hidden on the new models.\n\n`npm run dev` · ~~old~~ · [Todoi](https://todoi.com)",
  },
  parameters: { docs: { description: { component: "Read-only renderer for item descriptions and comments: the Markdown subset the GitHub / Embridge sync writes (headings, lists, tasks, quotes, fences, inline emphasis, links, @mentions and item keys); no raw HTML, images or tables. Pass members so only real @names render as mentions, and onOpenKey to make item keys like MP-112 open the item. Use renderMarkdown when you need the blocks without the wrapper." } } },
} satisfies Meta<typeof Markdown>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Description: Story = {
  // link-in-text-block: .td-md a has no underline and only 2.48:1 contrast against body text in Rounded Light.
  parameters: { a11y: { test: "todo" } },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("heading", { level: 1, name: "Launch plan" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Todoi" })).toHaveAttribute("href", "https://todoi.com");
    const key = canvas.getByRole("link", { name: "MP-112" });
    await userEvent.click(key);
    await expect(args.onOpenKey).toHaveBeenCalledWith("MP-112");
    key.focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onOpenKey).toHaveBeenCalledTimes(2);
  },
};
export const Lists: Story = {
  // link-in-text-block: .td-md a has no underline and only 2.48:1 contrast against body text in Rounded Light.
  parameters: { a11y: { test: "todo" } },
  args: { text: "## Before launch\n1. Price list\n2. Stock check\n3) Photos\n\n- loose bullet\n* another one\n\nA paragraph with a single\nline break and a bare link https://todoi.com/p/helicopters." },
};
export const CodeBlock: Story = {
  args: { text: "### Repro\n```\nnpm run dev\ncurl localhost:3000/api/health\n```\nEscaped \\*stars\\* stay literal." },
};
export const UnknownMention: Story = {
  args: { text: "@flo and @sam can review; @nobody is not a member, so it stays plain text." },
  async play({ canvasElement }) {
    const mentions = [...canvasElement.querySelectorAll(".td-md-mention")].map((el) => el.textContent);
    await expect(mentions).toEqual(["@flo", "@sam"]);
  },
};
export const StaticItemKeys: Story = {
  args: { onOpenKey: undefined, text: "Blocked by MP-112 and HE-7." },
  async play({ canvas }) {
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
  },
};
export const Empty: Story = { args: { text: "" } };
