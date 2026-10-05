// The Claude Design project the tool targets: its web address, and reading one back from what a
// developer pastes (a project link or a bare id). No Node imports: the GUI uses this too.

/** The project's page in Claude Design */
export const projectUrl = (id: string) => `https://claude.ai/design/p/${encodeURIComponent(id)}`;

/** A project id from a pasted link (…/design/p/<id>) or a bare id; null when it is neither */
export function parseProjectRef(input: string): string | null {
  const s = input.trim();
  const fromUrl = /\/design\/p\/([A-Za-z0-9-]+)/.exec(s)?.[1];
  if (fromUrl) return fromUrl;
  return /^[A-Za-z0-9-]{3,}$/.test(s) ? s : null;
}
