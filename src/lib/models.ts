import type { ModelInfo } from "./types";

/** Static catalog based on the models exposed by the configured SmartAPI account. */
export const MODEL_CATALOG: ModelInfo[] = [
  {
    id: "claude-fable-5",
    displayName: "Claude Fable 5",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "balanced",
    useCase: "General assistant",
    sortOrder: 10,
  },
  {
    id: "claude-fable-5-1",
    displayName: "Claude Fable 5.1",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "balanced",
    useCase: "General assistant",
    sortOrder: 20,
  },
  {
    id: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "premium",
    useCase: "Complex tasks",
    sortOrder: 30,
  },
  {
    id: "claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "premium",
    useCase: "Complex tasks",
    sortOrder: 40,
  },
  {
    id: "claude-opus-4-8",
    displayName: "Claude Opus 4.8",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "premium",
    useCase: "Complex tasks",
    sortOrder: 50,
  },
  {
    id: "claude-opus-5",
    displayName: "Claude Opus 5",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "premium",
    useCase: "Complex tasks",
    sortOrder: 60,
  },
  {
    id: "claude-opus-5-5",
    displayName: "Claude Opus 5.5",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "premium",
    useCase: "Complex tasks",
    sortOrder: 70,
  },
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "balanced",
    useCase: "Everyday work",
    sortOrder: 80,
  },
  {
    id: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "balanced",
    useCase: "Everyday work",
    sortOrder: 90,
  },
  {
    id: "claude-sonnet-5-5",
    displayName: "Claude Sonnet 5.5",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "balanced",
    useCase: "Everyday work",
    sortOrder: 100,
  },
  {
    id: "codex-auto-review",
    displayName: "Codex Auto Review",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "balanced",
    useCase: "Code review",
    sortOrder: 110,
  },
  {
    id: "gpt-5.5",
    displayName: "GPT 5.5",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "balanced",
    useCase: "General assistant",
    sortOrder: 120,
  },
  {
    id: "gpt-5.6-luna",
    displayName: "GPT 5.6 Luna",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "balanced",
    useCase: "Fast everyday work",
    sortOrder: 130,
  },
  {
    id: "gpt-5.6-sol",
    displayName: "GPT 5.6 Sol",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "premium",
    useCase: "Complex reasoning",
    sortOrder: 140,
  },
  {
    id: "gpt-5.6-terra",
    displayName: "GPT 5.6 Terra",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "balanced",
    useCase: "General assistant",
    sortOrder: 150,
  },
  {
    id: "gpt-6-astra",
    displayName: "GPT 6 Astra",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "premium",
    useCase: "Complex reasoning",
    sortOrder: 160,
  },
  {
    id: "gpt-6-luna",
    displayName: "GPT 6 Luna",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "balanced",
    useCase: "Fast everyday work",
    sortOrder: 170,
  },
  {
    id: "gpt-6-sol",
    displayName: "GPT 6 Sol",
    provider: "smartapi",
    costMultiplier: null,
    costPerImage: null,
    tier: "premium",
    useCase: "Complex reasoning",
    sortOrder: 180,
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
