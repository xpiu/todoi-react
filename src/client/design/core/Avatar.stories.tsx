import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Avatar, AvatarStack } from "./Avatar";

// Inline image so the story never touches the network.
const PHOTO = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#7aa2d6"/><circle cx="16" cy="13" r="6" fill="#f4e3d3"/><path d="M5 31c1.5-7 6-10 11-10s9.5 3 11 10z" fill="#f4e3d3"/></svg>');
const MEMBERS = [
  { id: "u1", name: "Flo Zuallaert" },
  { id: "u2", name: "Sam Verhoeven" },
  { id: "u3", name: "Marit Olsen", color: "var(--label-teal)" },
  { id: "u4", name: "Jonas Berg" },
  { id: "u5", name: "Ana Lopes" },
];

const meta = {
  title: "Core/Avatar",
  component: Avatar,
  args: { name: "Flo Zuallaert" },
  parameters: { docs: { description: { component: "A person's face: the image when `src` is set, otherwise initials on a label-palette token picked from the name (or `color`). Use 32px in comments, 28px in the top bar and 20px on rows. AvatarStack overlaps several avatars for assignees and members and collapses the rest into “+n”." } } },
} satisfies Meta<typeof Avatar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {
  async play({ canvas }) {
    // Screen readers hear the name, not the initials.
    const avatar = canvas.getByRole("img", { name: "Flo Zuallaert" });
    await expect(avatar).toHaveTextContent("FZ");
  },
};
export const Photo: Story = {
  args: { src: PHOTO },
  async play({ canvas }) {
    await expect(canvas.getByRole("img", { name: "Flo Zuallaert" })).toHaveAttribute("src", PHOTO);
  },
};
export const CustomColor: Story = { args: { name: "Marit Olsen", color: "var(--label-teal)", size: 28 } };
export const Sizes: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {[20, 28, 32, 48].map((size) => <Avatar key={size} {...args} size={size} />)}
    </div>
  ),
};
export const BesideName: Story = {
  args: { decorative: true },
  render: (args) => (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <Avatar {...args} />
      {args.name}
    </span>
  ),
  async play({ canvas }) {
    // The visible name already says who it is; the avatar stays out of the accessibility tree.
    await expect(canvas.queryByRole("img")).not.toBeInTheDocument();
    await expect(canvas.getByTitle("Flo Zuallaert")).toHaveAttribute("aria-hidden", "true");
  },
};
export const UnknownPerson: Story = { args: { name: undefined } };
export const Stack: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
      <AvatarStack people={MEMBERS.slice(0, 2)} size={24} />
      <AvatarStack people={MEMBERS} size={24} />
      <AvatarStack people={MEMBERS} size={20} max={2} />
    </div>
  ),
  async play({ canvas }) {
    // Five people, three faces, then the overflow disc; each stack is one image named by everyone in it.
    await expect(canvas.getAllByRole("img", { name: "Flo Zuallaert, Sam Verhoeven, Marit Olsen, Jonas Berg, Ana Lopes" })).toHaveLength(2);
    await expect(canvas.getByRole("img", { name: "Flo Zuallaert, Sam Verhoeven" })).toBeVisible();
    await expect(canvas.getByText("+2")).toBeVisible();
    await expect(canvas.getByText("+3")).toBeVisible();
  },
};
