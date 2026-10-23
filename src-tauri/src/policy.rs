//! Safety policy for the code agent. The model only proposes actions; this file decides what is
//! allowed, what needs the user's click and what is never allowed. The UI sets `approved` after a
//! click, the model cannot, so every command re-checks the policy here.

use serde::Serialize;
use std::path::{Component, Path};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "decision", content = "reason", rename_all = "snake_case")]
pub enum Decision {
    Allow,
    Ask(String),
    Deny(String),
}

use Decision::{Allow, Ask, Deny};

const SECRET_DIRS: &[&str] = &[".git", ".ssh", ".gnupg", "appdata"];
const BUILD_DIRS: &[&str] = &["node_modules", "target", "dist", ".next", ".vercel", ".venv", "__pycache__"];
const SECRET_EXTENSIONS: &[&str] = &["pem", "key", "pfx", "p12", "keystore", "jks", "kdbx"];
const SECRET_NAMES: &[&str] = &[".npmrc", ".pypirc", ".netrc", "credentials.json"];

/// Folders the listing and search skip entirely (build output, VCS internals, secrets).
pub fn is_skipped_dir(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    SECRET_DIRS.contains(&name.as_str()) || BUILD_DIRS.contains(&name.as_str())
}

/// Why a path must not be touched, or `None`. Writes are stricter: build folders are read-only.
pub fn path_blocked(relative: &Path, write: bool) -> Option<&'static str> {
    let components: Vec<_> = relative.components().collect();
    for (index, component) in components.iter().enumerate() {
        let Component::Normal(name) = component else { return Some("путь выходит за пределы рабочей папки") };
        let name = name.to_string_lossy().to_ascii_lowercase();
        let is_last = index == components.len() - 1;
        if SECRET_DIRS.contains(&name.as_str()) { return Some("служебная или секретная папка"); }
        if write && !is_last && BUILD_DIRS.contains(&name.as_str()) { return Some("папка сборки: изменять её нельзя"); }
        if is_last {
            let example = name.ends_with(".example") || name.ends_with(".sample") || name.ends_with(".template");
            if (name == ".env" || name.starts_with(".env.")) && !example { return Some("файл с секретами"); }
            if SECRET_NAMES.contains(&name.as_str()) || name.starts_with("id_rsa") || name.starts_with("id_ed25519") || name.starts_with("id_ecdsa") {
                return Some("файл с ключами или учётными данными");
            }
            if name.starts_with("service-account") && name.ends_with(".json") { return Some("файл с ключами или учётными данными"); }
            let extension = Path::new(&name).extension().and_then(|value| value.to_str()).unwrap_or("");
            if SECRET_EXTENSIONS.contains(&extension) { return Some("файл с ключами или сертификатом"); }
        }
    }
    None
}

const SHELL_META: &[char] = &['&', '|', '>', '<', '^', '%', ';', '`', '$', '(', ')', '{', '}', '\n', '\r', '\0'];

/// Splits a command line into program and arguments. Quotes only group words; there is no shell,
/// so anything that could chain, redirect or expand is rejected up front.
pub fn parse_command(input: &str) -> Result<Vec<String>, String> {
    if input.trim().is_empty() { return Err("пустая команда".into()); }
    if input.len() > 600 { return Err("команда слишком длинная".into()); }
    if input.chars().any(|ch| SHELL_META.contains(&ch)) {
        return Err("команда содержит символы управления оболочкой (& | > < ^ % ; ` $ ( ) { })".into());
    }
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut started = false;
    for ch in input.chars() {
        match quote {
            Some(q) if ch == q => quote = None,
            Some(_) => current.push(ch),
            None if ch == '"' || ch == '\'' => { quote = Some(ch); started = true; }
            None if ch.is_whitespace() => {
                if started || !current.is_empty() { tokens.push(std::mem::take(&mut current)); started = false; }
            }
            None => current.push(ch),
        }
    }
    if quote.is_some() { return Err("не закрыта кавычка".into()); }
    if started || !current.is_empty() { tokens.push(current); }
    if tokens.is_empty() { return Err("пустая команда".into()); }
    Ok(tokens)
}

/// Lower-case program name without `.exe` / `.cmd`. A path or a script extension is not accepted.
pub fn program_name(token: &str) -> Result<String, String> {
    if token.contains('/') || token.contains('\\') { return Err("укажите программу без пути".into()); }
    let lower = token.to_ascii_lowercase();
    if lower.ends_with(".bat") || lower.ends_with(".ps1") || lower.ends_with(".vbs") || lower.ends_with(".sh") {
        return Err("запуск скриптов-файлов запрещён".into());
    }
    Ok(lower.trim_end_matches(".exe").trim_end_matches(".cmd").to_string())
}

const DENIED_PROGRAMS: &[&str] = &[
    "rm", "del", "erase", "rmdir", "rd", "format", "shutdown", "restart", "reg", "regedit", "powershell", "pwsh", "cmd",
    "bash", "sh", "zsh", "wsl", "curl", "wget", "ssh", "scp", "sftp", "ftp", "telnet", "nc", "ncat", "sudo", "su", "runas",
    "chmod", "chown", "icacls", "takeown", "taskkill", "wmic", "mklink", "diskpart", "netsh", "certutil", "bitsadmin",
    "mshta", "wscript", "cscript", "rundll32", "sc", "schtasks", "vssadmin", "bcdedit", "cipher", "robocopy", "xcopy",
    "move", "copy", "ren", "rename", "mv", "cp", "dd", "fdisk", "mkfs",
];
const SAFE_SCRIPTS: &[&str] = &["test", "build", "lint", "typecheck", "check", "tsc", "format:check"];
const PACKAGE_MANAGERS: &[&str] = &["npm", "pnpm", "yarn"];
const SAFE_TOOLS: &[&str] = &["tsc", "eslint", "vitest", "jest", "prettier", "pytest", "ruff", "mypy"];

fn escapes_root(argument: &str) -> bool {
    let value = argument.split_once('=').map(|(_, rest)| rest).unwrap_or(argument);
    let bytes = value.as_bytes();
    let absolute = value.starts_with('/') || value.starts_with('\\') || (bytes.len() > 2 && bytes[1] == b':' && (bytes[2] == b'\\' || bytes[2] == b'/') && bytes[0].is_ascii_alphabetic());
    absolute || value.split(['/', '\\']).any(|part| part == "..")
}

/// Decides what to do with a command line. Called by the UI before asking the user and again by
/// `code_run`, so a command that is `Ask` still needs `approved` and a `Deny` never runs.
pub fn classify_command(input: &str) -> Decision {
    let tokens = match parse_command(input) {
        Ok(tokens) => tokens,
        Err(reason) => return Deny(reason),
    };
    let program = match program_name(&tokens[0]) {
        Ok(program) => program,
        Err(reason) => return Deny(reason),
    };
    if DENIED_PROGRAMS.contains(&program.as_str()) {
        return Deny(format!("«{program}» запрещена: используйте инструменты правки и git-инструменты Glow"));
    }
    if tokens[1..].iter().any(|argument| escapes_root(argument)) {
        return Deny("аргумент указывает за пределы рабочей папки".into());
    }
    let sub = tokens.get(1).map(|value| value.to_ascii_lowercase()).unwrap_or_default();
    let has = |flag: &str| tokens[1..].iter().any(|value| value.eq_ignore_ascii_case(flag));

    match program.as_str() {
        "git" => {
            if has("--force") || has("-f") || has("--hard") || has("--force-with-lease") { return Deny("force и --hard запрещены".into()); }
            match sub.as_str() {
                "push" | "reset" | "clean" | "rebase" | "filter-branch" | "gc" | "reflog" => Deny(format!("git {sub} запрещён: это делает пользователь")),
                "status" | "diff" | "log" | "show" | "rev-parse" | "blame" | "ls-files" => Allow,
                "branch" if tokens.len() == 2 || has("--list") || has("-a") || has("-v") => Allow,
                _ => Ask("команда git меняет репозиторий".into()),
            }
        }
        name if PACKAGE_MANAGERS.contains(&name) => {
            if sub == "publish" { return Deny("публикация пакетов запрещена".into()); }
            match sub.as_str() {
                "test" | "t" => Allow,
                "run" | "run-script" => match tokens.get(2).map(|value| value.to_ascii_lowercase()) {
                    Some(script) if SAFE_SCRIPTS.contains(&script.as_str()) => Allow,
                    _ => Ask("запуск произвольного скрипта проекта".into()),
                },
                other if SAFE_SCRIPTS.contains(&other) && name == "yarn" => Allow,
                "install" | "i" | "add" | "ci" | "remove" | "uninstall" | "update" | "upgrade" | "link" | "exec" | "dlx" => Ask("изменение или установка зависимостей".into()),
                _ => Ask("команда менеджера пакетов вне белого списка".into()),
            }
        }
        "npx" => match sub.as_str() {
            tool if SAFE_TOOLS.contains(&tool) => Allow,
            _ => Ask("npx может скачать и запустить стороннюю программу".into()),
        },
        "node" => if sub == "--test" { Allow } else { Ask("запуск произвольного скрипта Node".into()) },
        "cargo" => match sub.as_str() {
            "check" | "test" | "build" | "clippy" | "fmt" | "doc" => Allow,
            "publish" | "login" | "yank" | "owner" => Deny("публикация и учётные данные cargo запрещены".into()),
            "install" | "add" | "remove" | "update" | "uninstall" => Ask("изменение или установка зависимостей".into()),
            _ => Ask("команда cargo вне белого списка".into()),
        },
        "python" | "python3" | "py" => {
            let module = tokens.get(2).map(|value| value.to_ascii_lowercase()).unwrap_or_default();
            if sub == "-m" && matches!(module.as_str(), "pytest" | "unittest" | "mypy" | "ruff") { Allow }
            else if sub == "-m" && module == "pip" { Ask("установка Python-пакетов".into()) }
            else { Ask("запуск произвольного скрипта Python".into()) }
        }
        "go" => if matches!(sub.as_str(), "test" | "build" | "vet") { Allow } else { Ask("команда go вне белого списка".into()) },
        "dotnet" => if matches!(sub.as_str(), "test" | "build") { Allow } else { Ask("команда dotnet вне белого списка".into()) },
        "pip" | "pip3" => Ask("установка Python-пакетов".into()),
        name if SAFE_TOOLS.contains(&name) => Allow,
        other => Ask(format!("команда «{other}» вне белого списка")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_allow(command: &str) -> bool { classify_command(command) == Allow }
    fn is_ask(command: &str) -> bool { matches!(classify_command(command), Ask(_)) }
    fn is_deny(command: &str) -> bool { matches!(classify_command(command), Deny(_)) }

    #[test]
    fn secrets_and_vcs_internals_are_never_touched() {
        for path in [".env", ".env.local", "src/.env.production", ".git/config", "keys/id_rsa", "cert.pem", "a/server.key", ".npmrc", "service-account-prod.json", "AppData/x.txt"] {
            assert!(path_blocked(Path::new(path), false).is_some(), "{path}");
        }
        for path in [".env.example", ".gitignore", "src/main.rs", ".github/workflows/ci.yml", "docs/key-notes.md"] {
            assert!(path_blocked(Path::new(path), false).is_none(), "{path}");
        }
    }

    #[test]
    fn build_folders_are_read_only() {
        assert!(path_blocked(Path::new("node_modules/pkg/index.js"), false).is_none());
        assert!(path_blocked(Path::new("node_modules/pkg/index.js"), true).is_some());
        assert!(path_blocked(Path::new("target/debug/app.exe"), true).is_some());
        assert!(path_blocked(Path::new("src/build/tool.ts"), true).is_none());
    }

    #[test]
    fn parent_and_absolute_paths_are_rejected_as_outside() {
        assert!(path_blocked(Path::new("../outside.txt"), false).is_some());
        assert!(path_blocked(Path::new("/etc/passwd"), false).is_some());
    }

    #[test]
    fn parse_groups_quoted_words_and_rejects_shell_syntax() {
        assert_eq!(parse_command("npm run \"my script\"").unwrap(), vec!["npm", "run", "my script"]);
        assert_eq!(parse_command("git commit -m 'fix bug'").unwrap(), vec!["git", "commit", "-m", "fix bug"]);
        for bad in ["npm test && rm -rf .", "echo hi > file", "npm test | tee x", "echo %PATH%", "npm test; calc", "echo `id`", "echo $(id)", "npm \"test", ""] {
            assert!(parse_command(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn whitelisted_checks_run_without_asking() {
        for command in ["npm test", "npm run build", "npm run lint", "yarn test", "pnpm run typecheck", "npx tsc --noEmit", "node --test tests/a.mjs", "cargo test", "cargo check", "python -m pytest -q", "pytest", "go test ./...", "git status", "git diff", "git log --oneline", "git branch", "tsc -b"] {
            assert!(is_allow(command), "{command}");
        }
    }

    #[test]
    fn anything_that_changes_the_machine_asks_first() {
        for command in ["npm install left-pad", "npm run deploy", "npx create-react-app x", "node script.js", "cargo add serde", "pip install requests", "git commit -m x", "git branch feature", "docker build .", "python run.py"] {
            assert!(is_ask(command), "{command}");
        }
    }

    #[test]
    fn dangerous_commands_are_denied_even_if_approved() {
        for command in ["rm -rf .", "del /s x", "curl http://x", "powershell -c x", "cmd /c dir", "git push", "git push --force", "git reset --hard", "git clean -fd", "npm publish", "cargo publish", "bash run.sh", "run.bat", "..\\evil.exe", "npm test && x", "sudo npm test"] {
            assert!(is_deny(command), "{command}");
        }
    }

    #[test]
    fn arguments_cannot_point_outside_the_workspace() {
        for command in ["npm test --prefix ../other", "npx tsc -p ../tsconfig.json", "cargo test --manifest-path=../x/Cargo.toml", "python -m pytest C:\\Users\\x", "git diff /etc/passwd"] {
            assert!(is_deny(command), "{command}");
        }
        assert!(is_allow("npx tsc -p tsconfig.app.json"));
    }
}
