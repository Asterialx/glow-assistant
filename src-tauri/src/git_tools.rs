//! Git tools for the Glow Code agent and task checkpoints stored as refs. Everything goes through the
//! system `git` and works only inside the selected folder. Two risks are closed here: hooks never run
//! (a hook in a tracked folder such as .husky could be edited by the agent and would run arbitrary
//! code) and secret files never enter a commit or a checkpoint.

use crate::code_tools::{self, clip, relative};
use crate::policy;
use crate::state::AppState;
use serde::Serialize;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use tauri::State;

const MAX_STATUS_FILES: usize = 200;
const MAX_DIFF_CHARS: usize = 30_000;
const MAX_LOG: usize = 30;
const MAX_CHANGED: usize = 500;
const CHECKPOINT_REF: &str = "refs/glow/checkpoints";
const PRUNE_AFTER_DAYS: i64 = 30;

#[derive(Debug, Serialize)]
pub struct StatusFile { pub status: String, pub path: String }

#[derive(Debug, Serialize)]
pub struct StatusResult { pub is_repo: bool, pub branch: String, pub files: Vec<StatusFile>, pub truncated: bool }

#[derive(Debug, Serialize)]
pub struct DiffResult { pub diff: String, pub truncated: bool, pub note: String }

#[derive(Debug, Serialize)]
pub struct LogEntry { pub hash: String, pub date: String, pub author: String, pub subject: String }

#[derive(Debug, Serialize)]
pub struct LogResult { pub commits: Vec<LogEntry> }

#[derive(Debug, Serialize)]
pub struct BranchResult { pub branch: String }

#[derive(Debug, Serialize)]
pub struct CommitResult { pub commit: String, pub branch: String, pub files: usize, pub skipped: Vec<String> }

#[derive(Debug, Serialize)]
pub struct CheckpointInfo { pub mode: String }

#[derive(Debug, Serialize)]
pub struct FinishResult { pub changed: Vec<String> }

#[derive(Debug, Serialize)]
pub struct RestoreResult {
    pub restored: usize,
    pub skipped: Vec<String>,
    pub mode: String,
    /// Commits made since the task began. An undo restores files only; these stay in the history for the user to reset.
    pub commits: usize,
}

fn scratch() -> PathBuf { std::env::temp_dir().join("glow-git") }

fn base_command(root: &Path) -> Command {
    let hooks = scratch().join("no-hooks");
    let _ = std::fs::create_dir_all(&hooks);
    let mut command = Command::new("git");
    command
        .current_dir(root)
        .args(["-c", "core.fsmonitor=false", "-c", "core.pager=cat", "-c", "core.quotePath=false", "-c", "gc.auto=0"])
        .arg("-c").arg(format!("core.hooksPath={}", hooks.display()))
        .env("GIT_TERMINAL_PROMPT", "0").env("GIT_OPTIONAL_LOCKS", "0").env("LC_ALL", "C")
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
}

fn run(command: &mut Command) -> Result<Output, String> {
    command.output().map_err(|_| "Git не найден. Установите Git, чтобы использовать git-инструменты.".to_string())
}

fn git(root: &Path, args: &[&str]) -> Result<Output, String> { run(base_command(root).args(args)) }

/// stdout of a successful git call, or the first line of its error.
fn git_text(root: &Path, args: &[&str]) -> Result<String, String> {
    let output = git(root, args)?;
    if output.status.success() { return Ok(String::from_utf8_lossy(&output.stdout).into_owned()); }
    Err(first_line(&output))
}

fn first_line(output: &Output) -> String {
    let text = String::from_utf8_lossy(&output.stderr);
    let line = text.lines().map(str::trim).find(|line| !line.is_empty()).unwrap_or("git завершился с ошибкой");
    clip(line, 300)
}

pub fn is_repo(root: &Path) -> bool {
    git(root, &["rev-parse", "--is-inside-work-tree"]).map(|out| out.status.success() && String::from_utf8_lossy(&out.stdout).trim() == "true").unwrap_or(false)
}

fn has_commits(root: &Path) -> bool {
    git(root, &["rev-parse", "-q", "--verify", "HEAD"]).map(|out| out.status.success()).unwrap_or(false)
}

fn need_repo(root: &Path) -> Result<(), String> {
    if is_repo(root) { Ok(()) } else { Err("Эта папка не git-репозиторий. Выполнять git init агент не может: сделайте это сами.".into()) }
}

fn secret(path: &str) -> bool {
    relative(path, false).map(|rel| policy::path_blocked(&rel, true).is_some()).unwrap_or(true)
}

// ---------- reading ----------

fn parse_branch(header: &str) -> String {
    let text = header.trim_start_matches("## ");
    if let Some(name) = text.strip_prefix("No commits yet on ") { return name.to_string(); }
    if text.starts_with("HEAD (no branch)") { return "HEAD (detached)".into(); }
    text.split("...").next().unwrap_or(text).split_whitespace().next().unwrap_or(text).to_string()
}

/// Entries of `status --porcelain=v1 -z`: (status code, path). Renames carry a second path that is skipped.
fn parse_status(raw: &str) -> (String, Vec<(String, String)>) {
    let mut parts = raw.split('\0').filter(|part| !part.is_empty());
    let mut branch = String::new();
    let mut entries = Vec::new();
    while let Some(part) = parts.next() {
        if part.starts_with("## ") { branch = parse_branch(part); continue; }
        if part.len() < 4 { continue; }
        let code = part[..2].to_string();
        entries.push((code.trim().to_string(), part[3..].to_string()));
        if code.contains('R') || code.contains('C') { parts.next(); }
    }
    (branch, entries)
}

pub fn status_in(root: &Path) -> Result<StatusResult, String> {
    if !is_repo(root) { return Ok(StatusResult { is_repo: false, branch: String::new(), files: vec![], truncated: false }); }
    let raw = git_text(root, &["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all"])?;
    let (branch, entries) = parse_status(&raw);
    let mut files: Vec<StatusFile> = entries.into_iter()
        .filter(|(_, path)| relative(path, false).map(|rel| policy::path_blocked(&rel, false).is_none()).unwrap_or(false))
        .map(|(status, path)| StatusFile { status, path })
        .collect();
    let truncated = files.len() > MAX_STATUS_FILES;
    files.truncate(MAX_STATUS_FILES);
    Ok(StatusResult { is_repo: true, branch, files, truncated })
}

/// Drops the sections of files that must stay hidden (a tracked .env would otherwise leak into a diff).
fn filter_diff(text: &str) -> String {
    let mut kept = String::new();
    let mut keep = true;
    for line in text.split_inclusive('\n') {
        if let Some(header) = line.strip_prefix("diff --git ") {
            let path = header.rsplit_once(" b/").map(|(_, path)| path.trim_end()).unwrap_or("");
            keep = relative(path, false).map(|rel| policy::path_blocked(&rel, false).is_none()).unwrap_or(false);
        }
        if keep { kept.push_str(line); }
    }
    kept
}

pub fn diff_in(root: &Path, path: Option<&str>, staged: bool) -> Result<DiffResult, String> {
    need_repo(root)?;
    let mut args = vec!["diff", "--no-color", "--no-ext-diff", "--no-textconv", "-U3"];
    if staged { args.push("--cached"); }
    let rel;
    if let Some(path) = path.filter(|path| !path.trim().is_empty()) {
        rel = relative(path, false)?;
        code_tools::blocked(&rel, false)?;
        args.push("--");
        args.push(rel.to_str().ok_or("Недопустимый путь.")?);
    }
    let text = filter_diff(&git_text(root, &args)?);
    let truncated = text.chars().count() > MAX_DIFF_CHARS;
    let diff = if truncated { clip(&text, MAX_DIFF_CHARS) } else { text };
    let note = if diff.trim().is_empty() { "Изменений нет. Новые неотслеживаемые файлы в diff не попадают: смотрите git_status.".into() } else { String::new() };
    Ok(DiffResult { diff, truncated, note })
}

pub fn log_in(root: &Path, max_count: usize, path: Option<&str>) -> Result<LogResult, String> {
    need_repo(root)?;
    if !has_commits(root) { return Ok(LogResult { commits: vec![] }); }
    let count = max_count.clamp(1, MAX_LOG).to_string();
    let mut args = vec!["log", "--no-color", "-n", count.as_str(), "--date=short", "--format=%h%x1f%ad%x1f%an%x1f%s%x1e"];
    let rel;
    if let Some(path) = path.filter(|path| !path.trim().is_empty()) {
        rel = relative(path, false)?;
        code_tools::blocked(&rel, false)?;
        args.push("--");
        args.push(rel.to_str().ok_or("Недопустимый путь.")?);
    }
    let raw = git_text(root, &args)?;
    let commits = raw.split('\x1e').filter_map(|record| {
        let mut fields = record.trim().split('\x1f');
        Some(LogEntry { hash: fields.next()?.to_string(), date: fields.next()?.to_string(), author: fields.next()?.to_string(), subject: clip(fields.next()?, 200) })
    }).collect();
    Ok(LogResult { commits })
}

// ---------- writing ----------

fn valid_branch_name(name: &str) -> bool {
    let Some(rest) = name.strip_prefix("glow/") else { return false };
    !rest.is_empty() && rest.len() <= 60
        && rest.chars().next().map(|ch| ch.is_ascii_alphanumeric()).unwrap_or(false)
        && rest.chars().all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || matches!(ch, '.' | '_' | '-' | '/'))
        && !rest.contains("..") && !rest.contains("//") && !rest.ends_with('/') && !rest.ends_with('.') && !rest.ends_with(".lock")
}

/// Creates and checks out a branch. Only `glow/…` names are allowed so the agent never moves the user's branches.
pub fn branch_in(root: &Path, name: &str) -> Result<BranchResult, String> {
    need_repo(root)?;
    if !valid_branch_name(name) { return Err("Имя ветки должно быть вида glow/<название>: строчные латинские буквы, цифры, точка, дефис, подчёркивание.".into()); }
    if git(root, &["rev-parse", "-q", "--verify", &format!("refs/heads/{name}")])?.status.success() { return Err("Такая ветка уже есть.".into()); }
    let output = git(root, &["switch", "-c", name])?;
    if !output.status.success() { return Err(first_line(&output)); }
    Ok(BranchResult { branch: name.to_string() })
}

fn identity_args(root: &Path) -> Vec<String> {
    let has = |key: &str| git(root, &["config", "--get", key]).map(|out| out.status.success() && !String::from_utf8_lossy(&out.stdout).trim().is_empty()).unwrap_or(false);
    if has("user.name") && has("user.email") { return vec![]; }
    ["-c", "user.name=Glow Code", "-c", "user.email=glow-code@localhost"].iter().map(|s| s.to_string()).collect()
}

pub fn commit_in(root: &Path, message: &str, paths: Option<&[String]>) -> Result<CommitResult, String> {
    need_repo(root)?;
    let message = message.trim();
    if message.is_empty() || message.len() > 2000 || message.contains('\0') { return Err("Нужно сообщение коммита до 2000 символов.".into()); }
    let raw = git_text(root, &["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
    let (_, entries) = parse_status(&raw);
    let wanted: Option<BTreeSet<String>> = paths.map(|list| list.iter().map(|path| path.replace('\\', "/")).collect());
    let mut allowed = Vec::new();
    let mut skipped = Vec::new();
    for (_, path) in entries {
        if let Some(wanted) = &wanted { if !wanted.contains(&path) { continue; } }
        if secret(&path) { skipped.push(path); } else { allowed.push(path); }
    }
    if allowed.is_empty() { return Err("Нет изменений для коммита (секретные файлы и папки сборки в коммит не попадают).".into()); }
    for chunk in allowed.chunks(100) {
        let mut add = vec!["add", "-A", "--"];
        add.extend(chunk.iter().map(String::as_str));
        let output = git(root, &add)?;
        if !output.status.success() { return Err(first_line(&output)); }
    }
    let identity = identity_args(root);
    let mut command = base_command(root);
    command.args(&identity).args(["commit", "--no-verify", "--no-gpg-sign", "-m", message, "--only", "--"]).args(&allowed);
    let output = run(&mut command)?;
    if !output.status.success() { return Err(first_line(&output)); }
    let commit = git_text(root, &["rev-parse", "--short", "HEAD"])?.trim().to_string();
    let branch = git_text(root, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default().trim().to_string();
    Ok(CommitResult { commit, branch, files: allowed.len(), skipped })
}

// ---------- checkpoints on refs ----------

fn valid_task_id(task_id: &str) -> Result<(), String> {
    if task_id.is_empty() || task_id.len() > 64 || !task_id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_') { return Err("Недопустимый идентификатор задачи.".into()); }
    Ok(())
}

fn checkpoint_ref(task_id: &str, which: &str) -> String { format!("{CHECKPOINT_REF}/{task_id}/{which}") }

fn ref_exists(root: &Path, name: &str) -> bool {
    git(root, &["rev-parse", "-q", "--verify", name]).map(|out| out.status.success()).unwrap_or(false)
}

/// A commit holding the whole working tree (tracked and untracked, minus ignored and secret files),
/// built in a private index so the user's index, branch and files stay untouched.
fn snapshot_commit(root: &Path, label: &str) -> Result<String, String> {
    let directory = scratch();
    std::fs::create_dir_all(&directory).map_err(|_| "Не удалось создать точку отката.".to_string())?;
    let index = directory.join(format!("index-{}", uuid::Uuid::new_v4()));
    let result = (|| -> Result<String, String> {
        let real_index = git_text(root, &["rev-parse", "--path-format=absolute", "--git-path", "index"]).map(|text| PathBuf::from(text.trim())).ok();
        let copied = real_index.as_ref().map(|path| path.is_file() && std::fs::copy(path, &index).is_ok()).unwrap_or(false);
        let with_index = |args: &[&str]| -> Result<Output, String> { run(base_command(root).env("GIT_INDEX_FILE", &index).args(args)) };
        if !copied && has_commits(root) {
            let output = with_index(&["read-tree", "HEAD"])?;
            if !output.status.success() { return Err(first_line(&output)); }
        }
        let add = with_index(&["add", "-A", "--", "."])?;
        if !add.status.success() { return Err(first_line(&add)); }
        let listed = with_index(&["ls-files", "-z"])?;
        for path in String::from_utf8_lossy(&listed.stdout).split('\0').filter(|path| !path.is_empty()) {
            if secret(path) { let _ = with_index(&["rm", "--cached", "-q", "--", path]); }
        }
        let tree = String::from_utf8_lossy(&with_index(&["write-tree"])?.stdout).trim().to_string();
        if tree.is_empty() { return Err("Не удалось создать точку отката.".into()); }
        let mut commit = base_command(root);
        commit.env("GIT_AUTHOR_NAME", "Glow Code").env("GIT_AUTHOR_EMAIL", "glow-code@localhost").env("GIT_COMMITTER_NAME", "Glow Code").env("GIT_COMMITTER_EMAIL", "glow-code@localhost");
        commit.args(["commit-tree", tree.as_str(), "-m", label]);
        let parent = git_text(root, &["rev-parse", "-q", "--verify", "HEAD"]).ok().map(|text| text.trim().to_string()).filter(|text| !text.is_empty());
        if let Some(parent) = &parent { commit.args(["-p", parent.as_str()]); }
        let output = run(&mut commit)?;
        if !output.status.success() { return Err(first_line(&output)); }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    })();
    let _ = std::fs::remove_file(&index);
    result
}

fn prune_old_checkpoints(root: &Path) {
    let Ok(listing) = git_text(root, &["for-each-ref", "--format=%(refname) %(committerdate:unix)", CHECKPOINT_REF]) else { return };
    let cutoff = chrono::Utc::now().timestamp() - PRUNE_AFTER_DAYS * 86_400;
    for line in listing.lines() {
        let mut fields = line.split_whitespace();
        if let (Some(name), Some(stamp)) = (fields.next(), fields.next().and_then(|value| value.parse::<i64>().ok())) {
            if stamp < cutoff { let _ = git(root, &["update-ref", "-d", name]); }
        }
    }
}

/// Starts a task checkpoint. Outside a git repository the per-file snapshots of code_tools are used instead.
pub fn checkpoint_begin_in(root: &Path, task_id: &str) -> Result<CheckpointInfo, String> {
    valid_task_id(task_id)?;
    if !is_repo(root) { return Ok(CheckpointInfo { mode: "files".into() }); }
    prune_old_checkpoints(root);
    let commit = snapshot_commit(root, &format!("glow checkpoint before {task_id}"))?;
    let output = git(root, &["update-ref", &checkpoint_ref(task_id, "before"), &commit])?;
    if !output.status.success() { return Err(first_line(&output)); }
    Ok(CheckpointInfo { mode: "git".into() })
}

/// (status, old blob, new blob, path) for everything that differs between two snapshots.
fn raw_changes(root: &Path, from: &str, to: &str) -> Result<Vec<(char, String, String, String)>, String> {
    // --no-abbrev: the blob ids are compared with full ids from hash-object.
    let raw = git_text(root, &["diff", "--raw", "--no-abbrev", "-z", "--no-renames", "--no-ext-diff", "--relative", from, to])?;
    let mut parts = raw.split('\0').filter(|part| !part.is_empty());
    let mut changes = Vec::new();
    while let Some(meta) = parts.next() {
        let Some(path) = parts.next() else { break };
        let fields: Vec<&str> = meta.trim_start_matches(':').split_whitespace().collect();
        if fields.len() < 5 { continue; }
        changes.push((fields[4].chars().next().unwrap_or('M'), fields[2].to_string(), fields[3].to_string(), path.to_string()));
    }
    Ok(changes)
}

/// Closes the task: stores the "after" snapshot and returns every file that changed, including changes
/// made by commands such as a formatter, which the per-edit snapshots cannot see.
pub fn checkpoint_finish_in(root: &Path, task_id: &str) -> Result<FinishResult, String> {
    valid_task_id(task_id)?;
    let before = checkpoint_ref(task_id, "before");
    if !is_repo(root) || !ref_exists(root, &before) { return Ok(FinishResult { changed: vec![] }); }
    let commit = snapshot_commit(root, &format!("glow checkpoint after {task_id}"))?;
    let after = checkpoint_ref(task_id, "after");
    let output = git(root, &["update-ref", &after, &commit])?;
    if !output.status.success() { return Err(first_line(&output)); }
    let mut changed: Vec<String> = raw_changes(root, &before, &after)?.into_iter().map(|(_, _, _, path)| path).collect();
    changed.truncate(MAX_CHANGED);
    Ok(FinishResult { changed })
}

fn blob_of_file(root: &Path, path: &str) -> Option<String> {
    if !root.join(path).is_file() { return None; }
    git_text(root, &["hash-object", "--", path]).ok().map(|text| text.trim().to_string())
}

fn remove_empty_parents(root: &Path, path: &str) {
    let mut current = Path::new(path).parent().map(Path::to_path_buf);
    while let Some(directory) = current {
        if directory.as_os_str().is_empty() || std::fs::remove_dir(root.join(&directory)).is_err() { break; }
        current = directory.parent().map(Path::to_path_buf);
    }
}

/// Undoes a task from its checkpoints. Only files still in the state the agent left them are reverted;
/// a file edited since the task finished is reported as skipped so no later work of the user is lost.
/// `None` means this task has no git checkpoint (the caller falls back to per-file snapshots).
pub fn restore_git_in(root: &Path, task_id: &str) -> Result<Option<RestoreResult>, String> {
    valid_task_id(task_id)?;
    let before = checkpoint_ref(task_id, "before");
    if !is_repo(root) || !ref_exists(root, &before) { return Ok(None); }
    let after = checkpoint_ref(task_id, "after");
    if !ref_exists(root, &after) {
        let commit = snapshot_commit(root, &format!("glow checkpoint after {task_id}"))?;
        let output = git(root, &["update-ref", &after, &commit])?;
        if !output.status.success() { return Err(first_line(&output)); }
    }
    // The "before" snapshot has HEAD at the start of the task as its parent.
    let commits = git_text(root, &["rev-parse", "-q", "--verify", &format!("{before}^")]).ok()
        .map(|parent| parent.trim().to_string()).filter(|parent| !parent.is_empty())
        .and_then(|parent| git_text(root, &["rev-list", "--count", &format!("{parent}..HEAD")]).ok())
        .and_then(|count| count.trim().parse::<usize>().ok())
        .unwrap_or(0);
    let mut restored = 0;
    let mut skipped = Vec::new();
    for (status, _old, new, path) in raw_changes(root, &before, &after)? {
        let Ok(rel) = relative(&path, false) else { skipped.push(path); continue };
        if policy::path_blocked(&rel, true).is_some() { skipped.push(path); continue; }
        let current = blob_of_file(root, &path);
        let left_by_agent = if status == 'D' { current.is_none() } else { current.as_deref() == Some(new.as_str()) };
        if !left_by_agent { skipped.push(path); continue; }
        if status == 'A' {
            if std::fs::remove_file(root.join(&rel)).is_err() { skipped.push(path); continue; }
            remove_empty_parents(root, &path);
        } else {
            let output = git(root, &["restore", &format!("--source={before}"), "--worktree", "--", &path])?;
            if !output.status.success() { skipped.push(path); continue; }
        }
        restored += 1;
    }
    let _ = git(root, &["update-ref", "-d", &before]);
    let _ = git(root, &["update-ref", "-d", &after]);
    Ok(Some(RestoreResult { restored, skipped, mode: "git".into(), commits }))
}

// ---------- Tauri commands ----------

#[tauri::command]
pub fn git_status(state: State<'_, AppState>) -> Result<StatusResult, String> { status_in(&code_tools::root_of(&state)?) }

#[tauri::command]
pub fn git_diff(state: State<'_, AppState>, path: Option<String>, staged: Option<bool>) -> Result<DiffResult, String> {
    diff_in(&code_tools::root_of(&state)?, path.as_deref(), staged.unwrap_or(false))
}

#[tauri::command]
pub fn git_log(state: State<'_, AppState>, max_count: Option<usize>, path: Option<String>) -> Result<LogResult, String> {
    log_in(&code_tools::root_of(&state)?, max_count.unwrap_or(10), path.as_deref())
}

#[tauri::command]
pub fn git_branch(state: State<'_, AppState>, name: String) -> Result<BranchResult, String> { branch_in(&code_tools::root_of(&state)?, &name) }

#[tauri::command]
pub fn git_commit(state: State<'_, AppState>, message: String, paths: Option<Vec<String>>) -> Result<CommitResult, String> {
    commit_in(&code_tools::root_of(&state)?, &message, paths.as_deref())
}

/// The branch the agent is on, so the UI can let autopilot commit on glow/ branches without asking.
#[tauri::command]
pub fn git_current_branch(state: State<'_, AppState>) -> Result<String, String> {
    let root = code_tools::root_of(&state)?;
    Ok(status_in(&root)?.branch)
}

#[tauri::command]
pub fn checkpoint_begin(state: State<'_, AppState>, task_id: String) -> Result<CheckpointInfo, String> {
    checkpoint_begin_in(&code_tools::root_of(&state)?, &task_id)
}

#[tauri::command]
pub fn checkpoint_finish(state: State<'_, AppState>, task_id: String) -> Result<FinishResult, String> {
    checkpoint_finish_in(&code_tools::root_of(&state)?, &task_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn repo() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let sh = |args: &[&str]| { assert!(git(&root, args).unwrap().status.success(), "git {args:?}"); };
        sh(&["init", "-q", "-b", "main"]);
        sh(&["config", "user.email", "t@example.com"]);
        sh(&["config", "user.name", "Tester"]);
        sh(&["config", "commit.gpgsign", "false"]);
        // Byte-exact assertions need a repository that does not convert line endings; the autocrlf case has its own test.
        sh(&["config", "core.autocrlf", "false"]);
        fs::write(root.join("a.txt"), "one\ntwo\n").unwrap();
        fs::write(root.join("keep.txt"), "keep\n").unwrap();
        fs::write(root.join(".gitignore"), "ignored.log\nbuild/\n").unwrap();
        sh(&["add", "-A"]);
        sh(&["commit", "-q", "-m", "initial"]);
        (dir, root)
    }

    #[test]
    fn status_reports_branch_and_changes_and_hides_secrets() {
        let (_guard, root) = repo();
        fs::write(root.join("a.txt"), "changed\n").unwrap();
        fs::write(root.join("new.txt"), "n").unwrap();
        fs::write(root.join(".env"), "SECRET=1").unwrap();
        fs::write(root.join("ignored.log"), "x").unwrap();
        let status = status_in(&root).unwrap();
        assert!(status.is_repo);
        assert_eq!(status.branch, "main");
        let names: Vec<_> = status.files.iter().map(|file| file.path.as_str()).collect();
        assert!(names.contains(&"a.txt") && names.contains(&"new.txt"));
        assert!(!names.contains(&".env") && !names.contains(&"ignored.log"));
    }

    #[test]
    fn status_outside_a_repository_is_not_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let status = status_in(&dir.path().canonicalize().unwrap()).unwrap();
        assert!(!status.is_repo);
        assert!(diff_in(dir.path(), None, false).is_err());
    }

    #[test]
    fn diff_shows_changes_filters_secrets_and_validates_paths() {
        let (_guard, root) = repo();
        fs::write(root.join(".env"), "SECRET=1\n").unwrap();
        assert!(git(&root, &["add", "-f", ".env"]).unwrap().status.success());
        assert!(git(&root, &["commit", "-q", "-m", "tracked secret"]).unwrap().status.success());
        fs::write(root.join(".env"), "SECRET=2\n").unwrap();
        fs::write(root.join("a.txt"), "one\nTWO\n").unwrap();
        let diff = diff_in(&root, None, false).unwrap();
        assert!(diff.diff.contains("-two") && diff.diff.contains("+TWO"));
        assert!(!diff.diff.contains("SECRET"), "a tracked secret must not leak into the diff");
        assert!(diff_in(&root, Some(".env"), false).is_err());
        assert!(diff_in(&root, Some("../x"), false).is_err());
        assert!(diff_in(&root, Some("keep.txt"), false).unwrap().note.contains("Изменений нет"));
    }

    #[test]
    fn log_lists_recent_commits() {
        let (_guard, root) = repo();
        fs::write(root.join("a.txt"), "x\n").unwrap();
        assert!(commit_in(&root, "second commit", None).is_ok());
        let log = log_in(&root, 5, None).unwrap();
        assert_eq!(log.commits.len(), 2);
        assert_eq!(log.commits[0].subject, "second commit");
        assert_eq!(log_in(&root, 5, Some("keep.txt")).unwrap().commits.len(), 1);
    }

    #[test]
    fn branches_must_be_glow_branches_and_are_created_once() {
        let (_guard, root) = repo();
        for bad in ["main", "feature/x", "glow/", "glow/Bad", "glow/a..b", "glow/x.lock", "glow/ a", "glow/-x"] {
            assert!(branch_in(&root, bad).is_err(), "{bad}");
        }
        assert_eq!(branch_in(&root, "glow/fix-sum").unwrap().branch, "glow/fix-sum");
        assert_eq!(status_in(&root).unwrap().branch, "glow/fix-sum");
        assert!(branch_in(&root, "glow/fix-sum").is_err());
    }

    #[test]
    fn commit_stores_only_the_task_files_and_keeps_secrets_out() {
        let (_guard, root) = repo();
        fs::write(root.join("a.txt"), "changed\n").unwrap();
        fs::write(root.join("b.txt"), "other\n").unwrap();
        fs::write(root.join(".env"), "SECRET=1\n").unwrap();
        let only_a = commit_in(&root, "change a", Some(&["a.txt".to_string(), ".env".to_string()])).unwrap();
        assert_eq!(only_a.files, 1);
        assert_eq!(only_a.skipped, vec![".env".to_string()], "a requested secret is reported as skipped, never committed");
        let tracked = git_text(&root, &["ls-files"]).unwrap();
        assert!(tracked.contains("a.txt") && !tracked.contains(".env") && !tracked.contains("b.txt"));
        let all = commit_in(&root, "everything allowed", None).unwrap();
        assert_eq!(all.files, 1);
        assert!(git_text(&root, &["ls-files"]).unwrap().contains("b.txt"));
        assert!(!git_text(&root, &["ls-files"]).unwrap().contains(".env"));
        assert!(commit_in(&root, "nothing left", None).is_err());
        assert!(commit_in(&root, "   ", None).is_err());
    }

    #[test]
    fn commit_handles_deleted_files_and_does_not_need_a_configured_identity() {
        let (_guard, root) = repo();
        assert!(git(&root, &["config", "--unset", "user.email"]).unwrap().status.success());
        assert!(git(&root, &["config", "--unset", "user.name"]).unwrap().status.success());
        fs::remove_file(root.join("keep.txt")).unwrap();
        let result = commit_in(&root, "remove keep", None);
        // A configured global identity may exist on the machine; either way the commit must succeed.
        assert!(result.is_ok(), "{result:?}");
        assert!(!git_text(&root, &["ls-files"]).unwrap().contains("keep.txt"));
    }

    #[test]
    fn hooks_never_run() {
        let (_guard, root) = repo();
        fs::create_dir_all(root.join(".husky")).unwrap();
        fs::write(root.join(".husky/pre-commit"), "#!/bin/sh\ntouch hook-ran\n").unwrap();
        assert!(git(&root, &["config", "core.hooksPath", ".husky"]).unwrap().status.success());
        fs::write(root.join("a.txt"), "x\n").unwrap();
        commit_in(&root, "change", Some(&["a.txt".to_string()])).unwrap();
        assert!(!root.join("hook-ran").exists());
    }

    #[test]
    fn checkpoint_undo_reverts_edits_creations_and_command_changes() {
        let (_guard, root) = repo();
        fs::write(root.join("user-dirty.txt"), "before\n").unwrap();
        assert_eq!(checkpoint_begin_in(&root, "task-1").unwrap().mode, "git");
        fs::write(root.join("a.txt"), "agent edit\n").unwrap();
        fs::create_dir_all(root.join("src/deep")).unwrap();
        fs::write(root.join("src/deep/new.ts"), "export {}\n").unwrap();
        fs::remove_file(root.join("keep.txt")).unwrap();
        fs::write(root.join("user-dirty.txt"), "reformatted by a command\n").unwrap();
        fs::write(root.join("ignored.log"), "noise").unwrap();
        let finished = checkpoint_finish_in(&root, "task-1").unwrap();
        for expected in ["a.txt", "src/deep/new.ts", "keep.txt", "user-dirty.txt"] { assert!(finished.changed.iter().any(|path| path == expected), "{expected} in {:?}", finished.changed); }
        assert!(!finished.changed.iter().any(|path| path == "ignored.log"));
        let result = restore_git_in(&root, "task-1").unwrap().unwrap();
        assert_eq!(result.restored, 4);
        assert!(result.skipped.is_empty());
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "one\ntwo\n");
        assert_eq!(fs::read_to_string(root.join("keep.txt")).unwrap(), "keep\n");
        assert_eq!(fs::read_to_string(root.join("user-dirty.txt")).unwrap(), "before\n");
        assert!(!root.join("src/deep/new.ts").exists() && !root.join("src").exists(), "empty folders are removed too");
        assert!(root.join("ignored.log").exists(), "ignored files are never touched");
        assert!(!ref_exists(&root, &checkpoint_ref("task-1", "before")), "refs are cleaned after the undo");
        assert!(restore_git_in(&root, "task-1").unwrap().is_none());
    }

    #[test]
    fn undo_skips_files_changed_after_the_task_finished() {
        let (_guard, root) = repo();
        checkpoint_begin_in(&root, "task-2").unwrap();
        fs::write(root.join("a.txt"), "agent edit\n").unwrap();
        fs::write(root.join("keep.txt"), "agent edit 2\n").unwrap();
        checkpoint_finish_in(&root, "task-2").unwrap();
        fs::write(root.join("a.txt"), "the user kept working here\n").unwrap();
        let result = restore_git_in(&root, "task-2").unwrap().unwrap();
        assert_eq!(result.restored, 1);
        assert_eq!(result.skipped, vec!["a.txt".to_string()]);
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "the user kept working here\n");
        assert_eq!(fs::read_to_string(root.join("keep.txt")).unwrap(), "keep\n");
    }

    #[test]
    fn undo_reports_commits_made_during_the_task_and_leaves_them_in_history() {
        let (_guard, root) = repo();
        checkpoint_begin_in(&root, "task-10").unwrap();
        branch_in(&root, "glow/work").unwrap();
        fs::write(root.join("a.txt"), "agent edit\n").unwrap();
        commit_in(&root, "agent commit", None).unwrap();
        checkpoint_finish_in(&root, "task-10").unwrap();
        let result = restore_git_in(&root, "task-10").unwrap().unwrap();
        assert_eq!(result.commits, 1);
        assert_eq!(result.restored, 1);
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "one\ntwo\n", "the working file is back as before the task");
        assert_eq!(log_in(&root, 5, None).unwrap().commits[0].subject, "agent commit", "the commit itself is not rewritten");
    }

    #[test]
    fn undo_works_when_the_run_crashed_before_finishing() {
        let (_guard, root) = repo();
        checkpoint_begin_in(&root, "task-3").unwrap();
        fs::write(root.join("a.txt"), "half done\n").unwrap();
        let result = restore_git_in(&root, "task-3").unwrap().unwrap();
        assert_eq!(result.restored, 1);
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "one\ntwo\n");
    }

    #[test]
    fn checkpoints_leave_the_users_index_branch_and_staging_alone() {
        let (_guard, root) = repo();
        fs::write(root.join("staged.txt"), "staged\n").unwrap();
        assert!(git(&root, &["add", "staged.txt"]).unwrap().status.success());
        let head_before = git_text(&root, &["rev-parse", "HEAD"]).unwrap();
        let staged_before = git_text(&root, &["diff", "--cached", "--name-only"]).unwrap();
        checkpoint_begin_in(&root, "task-4").unwrap();
        fs::write(root.join("a.txt"), "x\n").unwrap();
        checkpoint_finish_in(&root, "task-4").unwrap();
        assert_eq!(git_text(&root, &["rev-parse", "HEAD"]).unwrap(), head_before);
        assert_eq!(git_text(&root, &["diff", "--cached", "--name-only"]).unwrap(), staged_before);
        assert_eq!(status_in(&root).unwrap().branch, "main");
    }

    #[test]
    fn checkpoints_never_copy_secret_files() {
        let (_guard, root) = repo();
        fs::write(root.join(".env"), "SECRET=1\n").unwrap();
        checkpoint_begin_in(&root, "task-5").unwrap();
        let files = git_text(&root, &["ls-tree", "-r", "--name-only", &checkpoint_ref("task-5", "before")]).unwrap();
        assert!(files.contains("a.txt") && !files.contains(".env"));
    }

    #[test]
    fn a_folder_that_is_not_a_repository_falls_back_to_file_snapshots() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        assert_eq!(checkpoint_begin_in(&root, "task-6").unwrap().mode, "files");
        assert!(checkpoint_finish_in(&root, "task-6").unwrap().changed.is_empty());
        assert!(restore_git_in(&root, "task-6").unwrap().is_none());
        assert!(checkpoint_begin_in(&root, "../bad").is_err());
    }

    #[test]
    fn a_subfolder_of_a_repository_only_sees_its_own_files() {
        let (_guard, root) = repo();
        fs::create_dir_all(root.join("app")).unwrap();
        fs::write(root.join("app/inner.txt"), "inner\n").unwrap();
        assert!(commit_in(&root, "add app", None).is_ok());
        let sub = root.join("app");
        checkpoint_begin_in(&sub, "task-7").unwrap();
        fs::write(sub.join("inner.txt"), "changed\n").unwrap();
        fs::write(root.join("a.txt"), "outside change\n").unwrap();
        let finished = checkpoint_finish_in(&sub, "task-7").unwrap();
        assert_eq!(finished.changed, vec!["inner.txt".to_string()]);
        restore_git_in(&sub, "task-7").unwrap().unwrap();
        assert_eq!(fs::read_to_string(sub.join("inner.txt")).unwrap(), "inner\n");
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "outside change\n");
    }

    #[test]
    fn crlf_files_come_back_unchanged_in_a_repository_with_autocrlf() {
        let (_guard, root) = repo();
        assert!(git(&root, &["config", "core.autocrlf", "true"]).unwrap().status.success());
        fs::write(root.join("win.txt"), "one\r\ntwo\r\n").unwrap();
        assert!(commit_in(&root, "crlf file", None).is_ok());
        checkpoint_begin_in(&root, "task-9").unwrap();
        fs::write(root.join("win.txt"), "agent\r\n").unwrap();
        let result = restore_git_in(&root, "task-9").unwrap().unwrap();
        assert_eq!(result.restored, 1);
        assert_eq!(fs::read_to_string(root.join("win.txt")).unwrap(), "one\r\ntwo\r\n");
        assert!(status_in(&root).unwrap().files.is_empty(), "the undo leaves no phantom changes");
    }

    #[test]
    fn unborn_repository_still_gets_a_checkpoint() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        assert!(git(&root, &["init", "-q", "-b", "main"]).unwrap().status.success());
        assert!(git(&root, &["config", "core.autocrlf", "false"]).unwrap().status.success());
        fs::write(root.join("x.txt"), "x\n").unwrap();
        assert_eq!(checkpoint_begin_in(&root, "task-8").unwrap().mode, "git");
        fs::write(root.join("x.txt"), "y\n").unwrap();
        fs::write(root.join("y.txt"), "new\n").unwrap();
        let result = restore_git_in(&root, "task-8").unwrap().unwrap();
        assert_eq!(result.restored, 2);
        assert_eq!(fs::read_to_string(root.join("x.txt")).unwrap(), "x\n");
        assert!(!root.join("y.txt").exists());
    }

    #[test]
    fn status_parser_handles_renames_and_branch_headers() {
        let (branch, entries) = parse_status("## main...origin/main [ahead 1]\0R  new.txt\0old.txt\0 M a.txt\0?? b.txt\0");
        assert_eq!(branch, "main");
        assert_eq!(entries, vec![("R".to_string(), "new.txt".to_string()), ("M".to_string(), "a.txt".to_string()), ("??".to_string(), "b.txt".to_string())]);
        assert_eq!(parse_branch("## No commits yet on main"), "main");
        assert_eq!(parse_branch("## HEAD (no branch)"), "HEAD (detached)");
    }
}
