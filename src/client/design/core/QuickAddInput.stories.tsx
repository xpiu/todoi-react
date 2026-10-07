import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { QuickAddInput } from "./QuickAddInput";

const meta = {
  title: "Core/QuickAddInput",
  component: QuickAddInput,
  decorators: [(Story) => <div style={{ maxWidth: 360 }}><Story /></div>],
  args: {
    "aria-label": "New item in To-do",
    autoFocus: false,
    today: "2026-10-07",
    labels: [{ text: "bug", color: "red" }, { text: "sales", color: "blue" }],
    members: [{ name: "Flo Zuallaert", nickname: "flo" }, "Sam Verhoeven"],
    lists: ["To-do", "Doing", "Done"],
    onSubmit: fn(),
    onCancel: fn(),
    onBlur: fn(),
  },
  parameters: { docs: { description: { component: "The N composer at the end of a list: one input that parses #label @assignee !priority due… >list while typing and previews the recognised tokens as chips. The field owns its text; the caller receives the parsed result on submit (Enter, field clears and stays open), cancel (Escape on empty) and blur. Pass the project's labels, members and lists, and a fixed today for deterministic relative dates. Inside a KeyNav, ↑/↓ at the text edges hand focus back to the rows." } } },
} satisfies Meta<typeof QuickAddInput>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const ParsedTokens: Story = { args: { defaultValue: "Fix login bug #bug @flo !high due fri >Doing" } };
export const UnknownTokens: Story = { args: { defaultValue: "Call the dealer #pricing @marit" } };
export const SmartDatesOff: Story = { args: { dates: false, defaultValue: "Plan the review due fri" } };
export const SubmitThenCancel: Story = {
  async play({ args, canvas, userEvent }) {
    const field = canvas.getByRole("textbox", { name: "New item in To-do" });
    await userEvent.click(field);
    await userEvent.type(field, "Fix login bug #bug @flo !high due fri >Doing{Enter}");
    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Fix login bug", assignee: "Flo Zuallaert", priority: "High", due: "2026-10-09", list: "Doing", labels: [{ text: "bug", color: "red", isNew: false }] }),
      "Fix login bug #bug @flo !high due fri >Doing",
    );
    await expect(field).toHaveValue("");
    await expect(field).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onSubmit).toHaveBeenCalledOnce();
    await userEvent.keyboard("{Escape}");
    await expect(args.onCancel).toHaveBeenCalledOnce();
  },
};
export const EscapeClearsTokensFirst: Story = {
  async play({ args, canvas, userEvent }) {
    const field = canvas.getByRole("textbox", { name: "New item in To-do" });
    await userEvent.click(field);
    await userEvent.type(field, "#bug !high");
    await userEvent.keyboard("{Escape}");
    await expect(field).toHaveValue("");
    await expect(args.onCancel).not.toHaveBeenCalled();
    field.blur();
    await expect(args.onBlur).toHaveBeenCalledWith(expect.objectContaining({ title: "" }), "");
  },
};
