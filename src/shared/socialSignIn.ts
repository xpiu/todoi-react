// Social sign-in (work plan R9): log in or create an account with GitHub or Google, through Better Auth's
// socialProviders (src/server/socialSignIn.ts registers them, the log-in and sign-up pages show the buttons).
//
// DISABLED FOR NOW. Both providers are switched off on purpose (`available: false`): we are disabling these
// login features until our human lead developer finds enough time to guide us through the slow GUI processes
// of these social login providers (registering the OAuth apps in GitHub's developer settings and the Google
// Cloud console, consent screen, verified domains, callback URLs). Until then the pages still show the
// buttons, visibly unavailable with `unavailableMessage`, and the server registers neither provider even if
// credentials are set. To turn one on: create its OAuth app (callback `${APP_URL}/api/auth/callback/<id>`),
// set its two env variables (config.ts), and flip `available` here.

export type SocialProviderId = "github" | "google";

export interface SocialProvider {
  id: SocialProviderId;
  /** As the provider writes its own name */
  name: string;
  /** Off until the lead developer has set up the provider's OAuth app (see above) */
  available: boolean;
}

export const SOCIAL_PROVIDERS: readonly SocialProvider[] = [
  { id: "github", name: "GitHub", available: false },
  { id: "google", name: "Google", available: false },
];

/** "GitHub login temporarily unavailable": the line under a provider's disabled button */
export const unavailableMessage = (p: SocialProvider) => `${p.name} login temporarily unavailable`;
