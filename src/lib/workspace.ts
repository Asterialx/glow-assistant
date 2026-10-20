import { invoke } from "@tauri-apps/api/core";

export type WorkspaceEntry = { name: string; relative_path: string; is_dir: boolean; size: number };

export function isDesktopApp(): boolean {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return false;
  const mobileUserAgent = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return !mobileUserAgent;
}

export async function chooseWorkspace(): Promise<string | null> {
  if (!isDesktopApp()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory: true, multiple: false, title: "Выберите рабочую папку Glow" });
  if (!selected || Array.isArray(selected)) return null;
  return invoke<string>("workspace_set_root", { path: selected });
}

export async function clearWorkspace(): Promise<void> {
  if (isDesktopApp()) await invoke("workspace_clear_root");
}

export async function currentWorkspaceName(): Promise<string | null> {
  if (!isDesktopApp()) return null;
  return invoke<string | null>("workspace_restore_root");
}

export async function listWorkspaceFiles(): Promise<WorkspaceEntry[]> {
  if (!isDesktopApp()) throw new Error("Рабочий режим доступен в настольном приложении Glow.");
  return invoke<WorkspaceEntry[]>("workspace_list_files");
}

export async function readWorkspaceFile(relativePath: string): Promise<Uint8Array> {
  const encoded = await invoke<string>("workspace_read_file", { relativePath });
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function writeWorkspaceFile(filename: string, bytes: Uint8Array): Promise<void> {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  await invoke("workspace_write_file", { filename, bytesBase64: btoa(binary) });
}
