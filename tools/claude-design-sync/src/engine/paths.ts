// Path and snapshot rules shared by the engine and the GUI. No Node imports.
import type { SnapshotMeta } from "./types";

/** Storybook examples belong to their component, never to a separate component unit. */
export const isStoryFile = (path: string) => /\.stories\.tsx?$/.test(path);

/** A Project archive of this project: an imported export (one whose manifest named no project counts) */
export const isProjectArchive = (s: SnapshotMeta, projectId: string) => s.source === "import" && (!s.projectId || s.projectId === projectId);
