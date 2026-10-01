// The local account until sign-in exists (migration 0001 creates it; Better Auth replaces this).
export const CURRENT_USER = { id: "local_user_000000000a", name: "Flo Zuallaert", nickname: "flo", email: "flo@helicopterseurope.com", avatarColor: "var(--label-blue)" };

/** People the views can name — the seed's two members until the members endpoint carries user details. */
export const SEED_PEOPLE = [
  { id: CURRENT_USER.id, name: CURRENT_USER.name, nickname: CURRENT_USER.nickname, avatarColor: "blue" },
  { id: "seed_user_sam_000000a", name: "Sam Verhoeven", nickname: "sam", avatarColor: "orange" },
];
