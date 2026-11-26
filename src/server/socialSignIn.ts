// Better Auth's socialProviders for social sign-in (work plan R9). A provider is registered only when it is
// switched on in shared/socialSignIn.ts AND its OAuth app's id and secret are set (config.ts).
//
// Both are switched off for now: we are disabling these login features until our human lead developer finds
// enough time to guide us through the slow GUI processes of these social login providers. Until then this
// returns {}, /api/auth/sign-in/social refuses every provider, and the pages show the buttons as unavailable.
import { SOCIAL_PROVIDERS, type SocialProviderId } from "../shared/socialSignIn";

interface OAuthEnv {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

const credentials = (env: OAuthEnv): Record<SocialProviderId, { clientId?: string; clientSecret?: string }> => ({
  github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
  google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
});

/** The providers Better Auth registers: switched on and configured. */
export function socialProvidersFor(env: OAuthEnv, providers = SOCIAL_PROVIDERS) {
  const all = credentials(env);
  const on: Partial<Record<SocialProviderId, { clientId: string; clientSecret: string }>> = {};
  for (const p of providers) {
    const { clientId, clientSecret } = all[p.id];
    if (p.available && clientId && clientSecret) on[p.id] = { clientId, clientSecret };
  }
  return on;
}
