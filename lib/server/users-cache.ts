const CACHE_TTL_MS = 2 * 60_000;
let usersCache: { users: unknown[]; expiresAt: number } | null = null;

export function getUsersCache(): unknown[] | null {
  if (usersCache && usersCache.expiresAt > Date.now()) {
    return usersCache.users;
  }
  return null;
}

export function setUsersCache(users: unknown[]) {
  usersCache = { users, expiresAt: Date.now() + CACHE_TTL_MS };
}

export function invalidateUsersCache() {
  usersCache = null;
}
