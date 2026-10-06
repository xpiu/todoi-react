// Path rules shared by the engine and the GUI. No Node imports.

/** Storybook examples belong to their component, never to a separate component unit. */
export const isStoryFile = (path: string) => /\.stories\.tsx?$/.test(path);
