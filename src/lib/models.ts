import type { ModelInfo } from "./types";

/** Static catalog (also seeded into meta SQLite). */
export const MODEL_CATALOG: ModelInfo[] = [
  {
    id: "opus-4.8",
    displayName: "Opus 4.8",
    provider: "smartapi",
    costMultiplier: 4.0,
    costPerImage: null,
    tier: "premium",
    useCase: "Complex reasoning, math",
    sortOrder: 10,
  },
  {
    id: "opus-4.7",
    displayName: "Opus 4.7",
    provider: "smartapi",
    costMultiplier: 4.0,
    costPerImage: null,
    tier: "premium",
    useCase: "Complex reasoning, math",
    sortOrder: 20,
  },
  {
    id: "opus-4.6",
    displayName: "Opus 4.6",
    provider: "smartapi",
    costMultiplier: 4.0,
    costPerImage: null,
    tier: "premium",
    useCase: "Complex reasoning, math",
    sortOrder: 30,
  },
  {
    id: "sonnet-5",
    displayName: "Sonnet 5",
    provider: "smartapi",
    costMultiplier: 2.5,
    costPerImage: null,
    tier: "balanced",
    useCase: "UI gen, daily coding",
    sortOrder: 40,
  },
  {
    id: "sonnet-4.6",
    displayName: "Sonnet 4.6",
    provider: "smartapi",
    costMultiplier: 2.0,
    costPerImage: null,
    tier: "balanced",
    useCase: "UI gen, daily coding",
    sortOrder: 50,
  },
  {
    id: "deepseek-v4-flash",
    displayName: "Deepseek V4 Flash",
    provider: "smartapi",
    costMultiplier: 0.6,
    costPerImage: null,
    tier: "ultra_cheap",
    useCase: "Fast text, parsing",
    sortOrder: 60,
  },
  {
    id: "deepseek-v4-pro",
    displayName: "Deepseek V4 Pro",
    provider: "smartapi",
    costMultiplier: 2.0,
    costPerImage: null,
    tier: "balanced",
    useCase: "Open-source advanced coding",
    sortOrder: 70,
  },
  {
    id: "mimo-v2.5",
    displayName: "MiMo V2.5",
    provider: "smartapi",
    costMultiplier: 0.8,
    costPerImage: null,
    tier: "cheap",
    useCase: "Chat",
    sortOrder: 80,
  },
  {
    id: "mimo-v2.5-pro",
    displayName: "MiMo V2.5 Pro",
    provider: "smartapi",
    costMultiplier: 2.0,
    costPerImage: null,
    tier: "balanced",
    useCase: "Chat",
    sortOrder: 90,
  },
  {
    id: "minimax-m3",
    displayName: "MiniMax M3",
    provider: "smartapi",
    costMultiplier: 2.0,
    costPerImage: null,
    tier: "balanced",
    useCase: "Creative tasks",
    sortOrder: 100,
  },
  {
    id: "gpt-5.6-sol",
    displayName: "GPT 5.6 Sol",
    provider: "smartapi",
    costMultiplier: 4.0,
    costPerImage: null,
    tier: "premium",
    useCase: "Premium reasoning",
    sortOrder: 110,
  },
  {
    id: "gpt-5.6-terra",
    displayName: "GPT 5.6 Terra",
    provider: "smartapi",
    costMultiplier: 3.5,
    costPerImage: null,
    tier: "premium",
    useCase: "Premium reasoning",
    sortOrder: 120,
  },
  {
    id: "gpt-5.6-luna",
    displayName: "GPT 5.6 Luna",
    provider: "smartapi",
    costMultiplier: 2.5,
    costPerImage: null,
    tier: "balanced",
    useCase: "Balanced GPT tasks",
    sortOrder: 130,
  },
  {
    id: "gpt-5.5",
    displayName: "GPT 5.5",
    provider: "smartapi",
    costMultiplier: 4.0,
    costPerImage: null,
    tier: "premium",
    useCase: "Premium reasoning",
    sortOrder: 140,
  },
  {
    id: "gpt-5.4",
    displayName: "GPT 5.4",
    provider: "smartapi",
    costMultiplier: 3.5,
    costPerImage: null,
    tier: "premium",
    useCase: "Premium reasoning",
    sortOrder: 150,
  },
  {
    id: "gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
    provider: "smartapi",
    costMultiplier: 1.5,
    costPerImage: null,
    tier: "cheap",
    useCase: "Routine tasks",
    sortOrder: 160,
  },
  {
    id: "gpt-image-2",
    displayName: "GPT Image 2",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: 800_000,
    tier: "image",
    useCase: "Diagrams / Assets",
    sortOrder: 170,
  },
  // —— McSix / Google Gemini ——
  {
    id: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash Lite",
    provider: "mcsix",
    costMultiplier: 0.25,
    costPerImage: null,
    tier: "ultra_cheap",
    useCase: "Fast chat · $0.1 / $0.4 per 1M",
    sortOrder: 200,
  },
  {
    id: "gemini-3.1-flash-lite",
    displayName: "Gemini 3.1 Flash Lite",
    provider: "mcsix",
    costMultiplier: 0.7,
    costPerImage: null,
    tier: "cheap",
    useCase: "Lite reasoning · $0.25 / $1.5 per 1M",
    sortOrder: 210,
  },
  {
    id: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    provider: "mcsix",
    costMultiplier: 1.0,
    costPerImage: null,
    tier: "cheap",
    useCase: "Everyday tasks · $0.3 / $2.5 per 1M",
    sortOrder: 220,
  },
  {
    id: "gemini-2.5-flash-thinking",
    displayName: "Gemini 2.5 Flash Thinking",
    provider: "mcsix",
    costMultiplier: 1.0,
    costPerImage: null,
    tier: "cheap",
    useCase: "Thinking · $0.3 / $2.5 per 1M",
    sortOrder: 230,
  },
  {
    id: "gemini-3.6-flash",
    displayName: "Gemini 3.6 Flash",
    provider: "mcsix",
    costMultiplier: 2.5,
    costPerImage: null,
    tier: "balanced",
    useCase: "Strong flash · $1.5 / $7.5 per 1M",
    sortOrder: 240,
  },
  {
    id: "gemini-3.5-flash",
    displayName: "Gemini 3.5 Flash",
    provider: "mcsix",
    costMultiplier: 3.0,
    costPerImage: null,
    tier: "balanced",
    useCase: "Strong flash · $1.5 / $9 per 1M",
    sortOrder: 250,
  },
  {
    id: "gemini-3.1-pro",
    displayName: "Gemini 3.1 Pro",
    provider: "mcsix",
    costMultiplier: 4.0,
    costPerImage: null,
    tier: "premium",
    useCase: "Pro reasoning · $2 / $12 per 1M",
    sortOrder: 260,
  },
];

export function getModel(id: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
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
