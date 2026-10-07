import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { InlineError } from "./InlineError";

const meta = {
  title: "Core/InlineError",
  component: InlineError,
  args: { message: "Couldn't save: the project name is already taken." },
  parameters: { docs: { description: { component: "A quiet danger line announced as an alert, placed directly under the control or form whose work failed. The caller owns the message and clears it (null renders nothing); use a Toast only for failures that have no such place." } } },
} satisfies Meta<typeof InlineError>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  async play({ canvas }) {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Couldn't save: the project name is already taken.");
  },
};
export const LongMessage: Story = {
  decorators: [(Story) => <div style={{ maxWidth: 320 }}><Story /></div>],
  args: { message: "Couldn't load comments, files and links. The server took too long to respond; check your connection and reopen the item to try again." },
};
export const NoError: Story = {
  args: { message: null },
  async play({ canvas }) {
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};
