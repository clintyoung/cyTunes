// Centralized env access with required-vs-optional discipline.
// Throws at module load if anything required is missing — fail fast.

// During `next build`, the "collect page data" pass loads each route's
// module to inspect exports. That triggers module-level env reads. The real
// env isn't available in the build container — only at deploy time. We
// short-circuit with a placeholder here so the build can proceed; runtime
// reads (real requests) still validate normally.
const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    if (IS_BUILD) return `BUILD_TIME_PLACEHOLDER_${name}`;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

function requireUrl(name: string): string {
  const v = required(name);
  if (IS_BUILD) return v;
  if (!/^https?:\/\//i.test(v)) {
    throw new Error(
      `Environment variable ${name} must start with "http://" or "https://" (got: ${v}). ` +
        `Common mistake: setting ${name}=cytunes.example.com instead of https://cytunes.example.com.`
    );
  }
  return v.replace(/\/+$/, ""); // strip trailing slashes so concatenations are clean
}

// In dev, Next.js loads .env.local automatically. In production (Docker),
// env comes from the compose file.
export const env = {
  appUrl: requireUrl("APP_URL"),
  sessionSecret: required("SESSION_SECRET"),
  databaseUrl: required("DATABASE_URL"),
  spotify: {
    clientId: required("SPOTIFY_CLIENT_ID"),
    clientSecret: required("SPOTIFY_CLIENT_SECRET"),
    redirectUri: requireUrl("SPOTIFY_REDIRECT_URI"),
  },
  getSongBpmKey: optional("GETSONGBPM_API_KEY"),
};
