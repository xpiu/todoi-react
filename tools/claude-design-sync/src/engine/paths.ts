// Path and snapshot rules shared by the engine and the GUI. No Node imports.
import type { SnapshotMeta, Unit } from "./types";

/** Storybook examples belong to their component, never to a separate component unit. */
export const isStoryFile = (path: string) => /\.stories\.tsx?$/.test(path);

/** A component's examples and usage notes: its stories and colocated docs (.mdx, .md, .prompt.md) */
export const isExampleFile = (path: string) => isStoryFile(path) || /\.mdx?$/.test(path);

/**
 * A kit component whose App side changed only in its examples: the component itself, its props and styles,
 * are as they were at the sync point, so a port would only add preview-card figures for new stories.
 */
export const examplesOnly = (u: Pick<Unit, "kind" | "app" | "design">) => u.kind === "component" && u.design.exists && !!u.app.changedPaths?.length && u.app.changedPaths.every(isExampleFile);

/** A Project archive of this project: an imported export (one whose manifest named no project counts) */
export const isProjectArchive = (s: SnapshotMeta, projectId: string) => s.source === "import" && (!s.projectId || s.projectId === projectId);
