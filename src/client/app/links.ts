// Absolute app links for Copy link actions and share dialogs.
import { projectPath } from "../../shared/projectLinks";

export const projectUrl = (project: { slug: string }, query = "") => `${window.location.origin}${projectPath(project.slug, query)}`;
