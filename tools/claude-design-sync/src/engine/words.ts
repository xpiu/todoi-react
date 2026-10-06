// Counted words, shared by the server's messages and the GUI. No Node imports.
export const plural = (n: number, w: string, p = `${w}s`) => `${n} ${n === 1 ? w : p}`;
