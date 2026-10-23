// Tool schemas for the Glow Code agent. The server owns them: a client can only pick a named set,
// never send its own tools. Argument strings stay small because validMessages caps a whole tool
// call at 20000 characters, so big files are built from a skeleton plus targeted edits.

const text = (maxLength, description) => ({ type: 'string', maxLength, description });
const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});

const READ_ONLY = [
  fn('code_list', 'List files and folders of the project (ignores .gitignore entries, build folders and secrets). Start here to see the project layout.', {
    path: text(500, 'Folder relative to the project root; default is the root.'),
    depth: { type: 'integer', minimum: 1, maximum: 4, description: 'How many levels to show; default 2.' },
  }),
  fn('code_read', 'Read a text file with its line count. Large files are returned in windows of up to 2000 lines; use start_line and end_line to continue.', {
    path: text(500, 'File path relative to the project root.'),
    start_line: { type: 'integer', minimum: 1 },
    end_line: { type: 'integer', minimum: 1 },
  }, ['path']),
  fn('code_search', 'Search file contents with a regular expression (Rust regex syntax). Returns path, line number and the matching line.', {
    pattern: text(300, 'Regular expression to find.'),
    path: text(500, 'Folder to search in; default is the whole project.'),
    include: text(100, 'Glob that file paths must match, for example *.ts'),
    ignore_case: { type: 'boolean' },
    max_results: { type: 'integer', minimum: 1, maximum: 100 },
  }, ['pattern']),
  fn('doc_read', 'Read a non-code document of the project as text: pdf, docx, xlsx, pptx, odt, rtf, csv, images and similar. Use code_read for source and text files.', {
    path: text(500, 'File path relative to the project root.'),
  }, ['path']),
  fn('git_status', 'Current branch and the changed files of the project (git). Says is_repo false when the folder is not a git repository.'),
  fn('git_diff', 'Show uncommitted changes as a unified diff (git). Untracked new files are not part of a diff: list them with git_status.', {
    path: text(500, 'Limit the diff to one file.'),
    staged: { type: 'boolean', description: 'Show staged changes instead of working-tree changes.' },
  }),
  fn('git_log', 'Recent commits (git): hash, date, author, subject.', {
    max_count: { type: 'integer', minimum: 1, maximum: 30 },
    path: text(500, 'Only commits that touched this file.'),
  }),
  fn('update_tasks', 'Show the user your task list and keep it current: call it before you start and whenever a task changes status. At most one task is in_progress.', {
    tasks: {
      type: 'array', maxItems: 12,
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'title', 'status'],
        properties: { id: text(32, 'Short stable id such as t1.'), title: text(160, 'One short imperative phrase.'), status: { type: 'string', enum: ['pending', 'in_progress', 'done'] } },
      },
    },
  }, ['tasks']),
];

const WRITE = [
  fn('code_edit', 'Replace one exact fragment of an existing file. old_string must appear exactly once (copy it with its indentation from code_read), otherwise add surrounding lines or set replace_all. Prefer small edits over rewriting a file.', {
    path: text(500),
    old_string: text(8000, 'Exact text to replace.'),
    new_string: text(8000, 'Replacement text.'),
    replace_all: { type: 'boolean' },
  }, ['path', 'old_string', 'new_string']),
  fn('code_create', 'Create a new file (fails if it exists). Content is limited to about 15000 characters: create larger files as a skeleton and extend them with code_edit.', {
    path: text(500),
    content: text(15000),
  }, ['path', 'content']),
  fn('code_delete', 'Delete one file. The user is always asked to confirm.', { path: text(500) }, ['path']),
  fn('code_run', 'Run a command in the project root to test or build (npm test, npm run build, tsc, cargo test, pytest, git status ...). No shell: no pipes, redirects, && or variables. Unknown commands ask the user; dangerous ones are refused.', {
    command: text(600, 'Program and arguments, for example: npm run build'),
    timeout_sec: { type: 'integer', minimum: 5, maximum: 600 },
  }, ['command']),
  fn('git_branch', 'Create and switch to a new branch. The name must start with glow/ (for example glow/fix-sum-bug). Use it before committing when the project is on main or master.', {
    name: text(80, 'Branch name such as glow/fix-sum-bug: lowercase letters, digits, dots, dashes and underscores.'),
  }, ['name']),
  fn('git_commit', 'Commit changes (git). Hooks are not run and secret files are never included. Commit only when the user asked for it or the task plan says so. Without paths, all changed files are committed.', {
    message: text(2000, 'Commit message: a short imperative subject, optionally followed by a blank line and details.'),
    paths: { type: 'array', maxItems: 30, items: text(300), description: 'Commit only these files (up to 30); omit to commit all changed files.' },
  }, ['message']),
];

export const CODE_TOOL_SETS = Object.freeze({
  code_plan: Object.freeze(READ_ONLY),
  code_agent: Object.freeze([...READ_ONLY, ...WRITE]),
});

/** The tool list for a named set, or null for an unknown name. */
export function codeToolsFor(name) {
  return typeof name === 'string' && Object.hasOwn(CODE_TOOL_SETS, name) ? CODE_TOOL_SETS[name] : null;
}
