export const WORKSPACE_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "workspace_list_files",
      description: "List supported project files and folders in the selected Glow workspace. Call before choosing files to inspect.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "workspace_read_file",
      description: "Read one supported file from the selected workspace. Use a relative_path returned by workspace_list_files.",
      parameters: { type: "object", properties: { relative_path: { type: "string", maxLength: 500 } }, required: ["relative_path"], additionalProperties: false },
    },
  },
] as const;

export type WorkspaceToolCall = { id: string; name: string; arguments: string };
