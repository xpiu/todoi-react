import { EmptyState } from "../design/core/EmptyState";
import type { IconName } from "../design/core/Icon";

/** A page that exists in the plan but not yet in the app: one EmptyState on the canvas. */
export function PlaceholderScreen({ title, hint, icon }: { title: string; hint: string; icon: IconName }) {
  return (
    <div className="td-screen-canvas">
      <EmptyState icon={icon} title={title} hint={hint} />
    </div>
  );
}
