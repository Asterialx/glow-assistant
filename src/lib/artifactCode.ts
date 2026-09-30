/**
 * Languages that deserve a dedicated, editable code Artifact instead of a
 * cramped chat block. HTML is intentionally excluded: it has its own live
 * preview contract.
 */
export const CODE_ARTIFACT_LANGUAGES = [
  "ts", "tsx", "typescript", "js", "jsx", "javascript",
  "python", "py", "rs", "rust", "go", "java", "kt", "kotlin",
  "c", "cpp", "c++", "csharp", "c#", "cs", "php", "rb", "ruby", "swift",
  "sql", "sh", "bash", "zsh", "yaml", "yml", "json", "toml",
] as const;

const CODE_LANGUAGE_PATTERN = CODE_ARTIFACT_LANGUAGES
  .map((language) => language.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

export const CODE_ARTIFACT_FENCE = new RegExp(
  "```(" + CODE_LANGUAGE_PATTERN + ")(?![A-Za-z0-9_+#-])[^\\n]*\\n([\\s\\S]*?)```",
  "i",
);

export type CodeArtifactSource = { lang: string; body: string };

/** Large code belongs in the Artifact panel; short snippets stay in chat. */
export function extractCodeArtifact(text: string): CodeArtifactSource | null {
  const match = text.match(CODE_ARTIFACT_FENCE);
  if (!match) return null;
  const body = (match[2] ?? "").trimEnd();
  const lines = body.split("\n").filter((line) => line.trim()).length;
  if (lines < 8) return null;
  return { lang: (match[1] || "code").toLowerCase(), body };
}
