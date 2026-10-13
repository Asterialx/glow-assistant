import { createContext, useContext } from "react";
import type { Access } from "./client";

export const AccountContext = createContext<{
  access: Access; signOut: () => Promise<void>; busy: boolean;
} | null>(null);
export const useAccount = () => useContext(AccountContext);
