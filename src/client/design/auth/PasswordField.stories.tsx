import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { PasswordField, type PasswordFieldProps } from "./PasswordField";
import "./AuthShell.css";

// Story state models the auth page that owns the value.
function ControlledPasswordField(args: PasswordFieldProps) {
  const [value, setValue] = useState(args.value);
  return <PasswordField {...args} value={value} onChange={(v) => { setValue(v); args.onChange(v); }} />;
}

const meta = {
  title: "Auth/PasswordField",
  component: PasswordField,
  render: (args) => <ControlledPasswordField key={args.value} {...args} />,
  decorators: [(Story) => <div className="td-auth-card"><Story /></div>],
  args: { value: "", onChange: fn(), minLength: 10 },
  parameters: { docs: { description: { component: "The one password input for auth cards: label row with a Show / Hide toggle, the field, and one requirement line that turns into the error. The page owns the value; `minLength` writes the default requirement and marks it met, `error` replaces it and sets aria-invalid." } } },
} satisfies Meta<typeof PasswordField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const TypeAndReveal: Story = {
  async play({ args, canvas, userEvent }) {
    const field = canvas.getByLabelText(/^Password/);
    await expect(field).toHaveAttribute("type", "password");
    await userEvent.type(field, "correct horse");
    await expect(args.onChange).toHaveBeenLastCalledWith("correct horse");
    await expect(canvas.getByText("At least 10 characters")).toHaveAttribute("data-ok", "true");
    const toggle = canvas.getByRole("button", { name: "Show" });
    await userEvent.click(toggle);
    await expect(field).toHaveAttribute("type", "text");
    await expect(canvas.getByRole("button", { name: "Hide" })).toHaveAttribute("aria-pressed", "true");
  },
};
export const WithHint: Story = { args: { label: "New password", hint: "Use a phrase you don't use anywhere else", value: "hunter2" } };
export const Invalid: Story = {
  args: { value: "short", error: "That password is too common. Try a longer phrase." },
  async play({ canvas }) {
    await expect(canvas.getByRole("alert")).toHaveTextContent("too common");
    await expect(canvas.getByLabelText(/^Password/)).toHaveAttribute("aria-invalid", "true");
  },
};
export const Disabled: Story = { args: { value: "correct horse battery", disabled: true } };
