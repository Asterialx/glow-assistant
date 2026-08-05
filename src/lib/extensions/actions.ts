import { focusAssistHint, listDirectory, openExternal, runShell } from "../tauri";
import { useExtensionsStore } from "./registry";
import type { ExtensionId } from "./catalog";

/** Run a real side-effect for an extension (Test / Open actions). */
export async function runExtensionAction(
  id: ExtensionId,
  action: "test" | "open" | "screenshot" | "focus",
): Promise<string> {
  const store = useExtensionsStore.getState();
  const cfg = (key: string, fb = "") => store.getConfig(id, key, fb);

  switch (id) {
    case "filesystem": {
      const root = cfg("root", "C:\\");
      const list = (await listDirectory(root)) || [];
      if (!list.length) {
        return `Listed ${root}: (empty or needs Tauri desktop app)`;
      }
      return `Listed ${root} (${list.length} entries):\n${list
        .slice(0, 20)
        .map((e) => `${e.is_dir ? "[dir]" : "[file]"} ${e.name}`)
        .join("\n")}`;
    }
    case "terminal": {
      const cwd = cfg("cwd") || undefined;
      const r = await runShell("echo Glow Terminal OK && cd", cwd);
      if (!r) return "Terminal requires the Glow desktop (Tauri) build.";
      return `${r.stdout}${r.stderr}`.trim() || `exit ${r.code}`;
    }
    case "windows": {
      if (action === "focus") {
        return (await focusAssistHint()) || "Open Windows Focus Assist settings.";
      }
      const r = await runShell("ver");
      return r ? `${r.stdout}${r.stderr}`.trim() : "Windows shell requires Tauri.";
    }
    case "git": {
      const repo = cfg("repo") || undefined;
      const r = await runShell("git status -sb", repo);
      if (!r) return "Git via shell requires Tauri.";
      return `${r.stdout}${r.stderr}`.trim() || `exit ${r.code}`;
    }
    case "docker": {
      const r = await runShell("docker version --format \"{{.Server.Version}}\"");
      if (!r) return "Docker CLI requires Tauri + Docker Desktop.";
      return `${r.stdout}${r.stderr}`.trim() || `exit ${r.code}`;
    }
    case "word":
    case "excel":
    case "powerpoint": {
      const app =
        id === "word" ? "winword" : id === "excel" ? "excel" : "powerpnt";
      const r = await runShell(`cmd /c start "" ${app}`);
      if (r && r.code === 0) return `Launched ${app}.`;
      // Fallback protocol / file association
      const ok = await openExternal(
        id === "word"
          ? "https://www.office.com/launch/word"
          : id === "excel"
            ? "https://www.office.com/launch/excel"
            : "https://www.office.com/launch/powerpoint",
      );
      return ok ? `Opened ${id} (web/desktop).` : `Could not launch ${id}.`;
    }
    case "screenshot": {
      const r = await runShell("cmd /c start ms-screenclip:");
      if (r && r.code === 0) return "Snipping Tool / Screen clip launched.";
      const r2 = await runShell("cmd /c start SnippingTool.exe");
      return r2 && r2.code === 0
        ? "SnippingTool launched."
        : "Could not launch screenshot tool.";
    }
    case "clipboard": {
      try {
        const text = await navigator.clipboard.readText();
        return text
          ? `Clipboard (${text.length} chars): ${text.slice(0, 200)}${text.length > 200 ? "…" : ""}`
          : "Clipboard is empty.";
      } catch {
        return "Clipboard permission denied — allow paste/read in the browser/OS.";
      }
    }
    case "chrome": {
      const { enableChromeAgent } = await import("../glowExtensions");
      await enableChromeAgent();
      return "Chrome Agent enabled.";
    }
    case "pdf-viewer":
      return "PDF Viewer ready — attach a .pdf in chat to extract text.";
    case "jupyter":
      return "Jupyter ready — attach .ipynb/.py or ask for a ```jupyter artifact.";
    case "dicom":
      return "DICOM ready — attach a .dcm file in chat.";
    case "blender":
    case "vscode":
    case "roblox":
    case "unity":
    case "medical-db":
    case "mcp-hub":
      return `${id} connector flagged On — manage details in Agents & MCP.`;
    default:
      return "OK";
  }
}
