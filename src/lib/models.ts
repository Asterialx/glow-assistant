import type { ModelInfo } from "./types";
import { betaAuthEnabled, supabase } from "../auth/client";

interface XkiroModel {
  id: string;
  display_name: string;
  modality: string;
  access_tier: string;
}

interface XkiroModelsResponse {
  data?: XkiroModel[];
}

let activeCatalog: ModelInfo[] = [];
let catalogRequest: Promise<ModelInfo[]> | null = null;

/** Fetch the account-safe model list exposed by xKiro's public catalog. */
export function loadModelCatalog(): Promise<ModelInfo[]> {
  if (catalogRequest) return catalogRequest;

  const isOpenRouter = import.meta.env.VITE_SMARTAPI_BASE_URL?.includes("openrouter.ai");
  const serverMode = betaAuthEnabled && !import.meta.env.DEV;
  const baseUrl = serverMode ? "/api/ai" : import.meta.env.DEV
    ? "/smartapi"
    : import.meta.env.VITE_SMARTAPI_BASE_URL || "https://api.xkiro.com/v1";

  catalogRequest = (async () => {
    const token = serverMode ? (await supabase?.auth.getSession())?.data.session?.access_token : undefined;
    return fetch(`${baseUrl.replace(/\/$/, "")}/models`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  })()
    .then(async (response) => {
      if (!response.ok) throw new Error(`Model catalog request failed (${response.status})`);
      const payload = (await response.json()) as XkiroModelsResponse;
      if (isOpenRouter) {
        const glm = (payload.data ?? []).find((model) => model.id === "z-ai/glm-5.3-flash");
        if (!glm) throw new Error("OpenRouter does not list z-ai/glm-5.3-flash for this account");
        const model: ModelInfo = {
          id: glm.id,
          displayName: glm.display_name || "GLM 5.3 Flash",
          provider: "z-ai",
          costMultiplier: null,
          costPerImage: null,
          tier: "cheap",
          useCase: "Fast general-purpose chat and coding",
          sortOrder: 0,
        };
        activeCatalog = [model];
        return activeCatalog;
      }
      const freeChatModels = (payload.data ?? [])
        .filter((model) => model.modality === "chat" && model.access_tier === "free")
        .map((model, index): ModelInfo => ({
          id: model.id,
          displayName: model.display_name || model.id,
          provider: model.id.split("/", 1)[0] || "xkiro",
          costMultiplier: null,
          costPerImage: null,
          tier: "cheap",
          useCase: "Free chat model",
          sortOrder: index,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      if (freeChatModels.length === 0) {
        throw new Error("xKiro returned no free chat models for this catalog");
      }
      activeCatalog = freeChatModels;
      return freeChatModels;
    })
    .catch((error: unknown) => {
      catalogRequest = null;
      throw error;
    });

  return catalogRequest;
}

export function getModel(id: string): ModelInfo | undefined {
  return activeCatalog.find((model) => model.id === id);
}

export function formatCostBadge(model: ModelInfo): string {
  if (model.tier === "image" && model.costPerImage != null) {
    return `${(model.costPerImage / 1000).toLocaleString()}k/img`;
  }
  if (model.costMultiplier != null) {
    return `x${model.costMultiplier.toFixed(2)}`;
  }
  return "—";
}

export function tierEmoji(tier: ModelInfo["tier"]): string {
  switch (tier) {
    case "premium":
      return "🔴";
    case "balanced":
      return "🟡";
    case "cheap":
    case "ultra_cheap":
      return "🟢";
    case "image":
      return "🎨";
  }
}
