// The kit's sample covers (512×162 SVG placeholders) by name, as URLs Vite serves.
const files = import.meta.glob<string>("./*.svg", { eager: true, query: "?url", import: "default" });

export const SAMPLE_COVERS: Record<string, string> = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.replace(/^\.\/|\.svg$/g, ""), url]));
