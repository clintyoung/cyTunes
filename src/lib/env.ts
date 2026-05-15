// Centralized env access with required-vs-optional discipline.
// Throws at module load if anything required is missing — fail fast.

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

// In dev, Next.js loads .env.local automatically. In production (Docker),
// env comes from the compose file.
export const env = {
  appUrl: required("APP_URL"),
  sessionSecret: required("SESSION_SECRET"),
  databaseUrl: required("DATABASE_URL"),
  spotify: {
    clientId: required("SPOTIFY_CLIENT_ID"),
    clientSecret: required("SPOTIFY_CLIENT_SECRET"),
    redirectUri: required("SPOTIFY_REDIRECT_URI"),
  },
  getSongBpmKey: optional("GETSONGBPM_API_KEY"),
};
