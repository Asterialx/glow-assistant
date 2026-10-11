// Explicit storage boundary. Supabase's own session storage is not wrapped.
let owner: string | null = null;
let required = false;

export function configureAccountStorage(accountRequired: boolean) { required = accountRequired; }
export function setStorageOwner(userId: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(userId)) throw new Error("Invalid storage owner");
  if (owner && owner !== userId) throw new Error("Reload before switching accounts");
  owner = userId;
}
export function accountStorageKey(key: string): string {
  if (owner) return `glow.account.${owner}.${key}`;
  if (required) throw new Error("Account storage accessed before authentication");
  return key;
}
export function createAccountStorage(getStorage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  return {
    getItem: (key: string) => getStorage().getItem(accountStorageKey(key)),
    setItem: (key: string, value: string) => getStorage().setItem(accountStorageKey(key), value),
    removeItem: (key: string) => getStorage().removeItem(accountStorageKey(key)),
  };
}
export const accountStorage = createAccountStorage(() => window.localStorage);
export const accountSessionStorage = createAccountStorage(() => window.sessionStorage);
