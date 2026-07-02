from __future__ import annotations

import os
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

from backend.app.core.logger import logger
from backend.app.tools.command_runtime.models import CommandShell

VALIDATION_TIMEOUT_SECONDS = 5


@dataclass(frozen=True)
class ShellDiscoveryResult:
    shell: CommandShell
    found: bool
    path: str | None = None
    label: str | None = None
    edition: str | None = None
    version: str | None = None
    diagnostics: list[str] = field(default_factory=list)
    error: str | None = None

    def to_payload(self) -> dict[str, object]:
        return {
            "shell": self.shell,
            "found": self.found,
            "path": self.path,
            "label": self.label,
            "edition": self.edition,
            "version": self.version,
            "diagnostics": list(self.diagnostics),
            "error": self.error,
        }


def discover_shell(shell: CommandShell, *, manual_path: str | None = None) -> ShellDiscoveryResult:
    candidates = _manual_candidates(manual_path) or _automatic_candidates(shell)
    diagnostics: list[str] = []
    for candidate in candidates:
        diagnostics.append(f"check:{candidate}")
        result = validate_shell_executable(shell, candidate)
        diagnostics.extend(result.diagnostics)
        if result.found:
            logger.info(
                "[CommandRuntime] shell 发现成功 | "
                f"shell={shell} | path={result.path} | label={result.label}"
            )
            return result
    error = _not_found_message(shell, manual=bool(manual_path))
    logger.warning(
        f"[CommandRuntime] shell 发现失败 | shell={shell} | manual={bool(manual_path)} | "
        f"error={error}"
    )
    return ShellDiscoveryResult(
        shell=shell,
        found=False,
        diagnostics=diagnostics,
        error=error,
    )


def validate_shell_executable(shell: CommandShell, path: str | Path) -> ShellDiscoveryResult:
    candidate = Path(str(path).strip().strip('"')).expanduser()
    diagnostics: list[str] = []
    if not str(candidate):
        return _invalid(shell, "路径不能为空", diagnostics)
    if not candidate.exists():
        return _invalid(shell, f"文件不存在: {candidate}", diagnostics)
    if not candidate.is_file():
        return _invalid(shell, f"路径不是文件: {candidate}", diagnostics)
    if not _looks_like_shell(shell, candidate):
        return _invalid(shell, _type_mismatch_message(shell, candidate), diagnostics)

    try:
        completed = subprocess.run(
            _validation_args(shell, candidate),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=VALIDATION_TIMEOUT_SECONDS,
            creationflags=_creationflags(),
            startupinfo=_startupinfo(),
        )
    except subprocess.TimeoutExpired:
        return _invalid(shell, "校验命令超时", diagnostics)
    except Exception as exc:
        return _invalid(shell, f"校验命令启动失败: {exc}", diagnostics)

    stdout = _decode(completed.stdout)
    stderr = _decode(completed.stderr)
    diagnostics.append(f"validation_exit:{completed.returncode}")
    if completed.returncode != 0 or "keydex" not in stdout:
        detail = stderr.strip() or stdout.strip() or f"exit={completed.returncode}"
        return _invalid(shell, f"校验命令失败: {detail}", diagnostics)

    label, edition, version = _label_from_validation(shell, candidate, stdout)
    return ShellDiscoveryResult(
        shell=shell,
        found=True,
        path=str(candidate.resolve()),
        label=label,
        edition=edition,
        version=version,
        diagnostics=diagnostics,
    )


def _manual_candidates(manual_path: str | None) -> list[Path]:
    cleaned = str(manual_path or "").strip()
    return [Path(cleaned)] if cleaned else []


def _automatic_candidates(shell: CommandShell) -> list[Path]:
    if shell == "cmd":
        return _dedupe_paths(
            [
                Path(os.environ.get("COMSPEC", "")),
                Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "cmd.exe",
            ]
        )
    if shell == "powershell":
        return _dedupe_paths(
            [
                _which_path("pwsh.exe"),
                _which_path("pwsh"),
                _which_path("powershell.exe"),
                _which_path("powershell"),
                Path(os.environ.get("ProgramFiles", r"C:\Program Files"))
                / "PowerShell"
                / "7"
                / "pwsh.exe",
                Path(os.environ.get("SystemRoot", r"C:\Windows"))
                / "System32"
                / "WindowsPowerShell"
                / "v1.0"
                / "powershell.exe",
            ]
        )
    return _dedupe_paths(_git_bash_candidates())


def _git_bash_candidates() -> list[Path]:
    roots = _existing_env_git_roots()
    roots.extend(_git_roots_from_git_executable())
    candidates: list[Path] = []
    for name in ("bash.exe", "bash"):
        candidate = _which_path(name)
        if _is_git_bash_path(candidate):
            candidates.append(candidate)
    for root in roots:
        candidates.extend([root / "bin" / "bash.exe", root / "usr" / "bin" / "bash.exe"])
    return candidates


def _existing_env_git_roots() -> list[Path]:
    roots: list[Path] = []
    for env_name, suffix in (
        ("ProgramFiles", ("Git",)),
        ("ProgramFiles(x86)", ("Git",)),
        ("LocalAppData", ("Programs", "Git")),
    ):
        base = os.environ.get(env_name)
        if not base:
            continue
        root = Path(base)
        for part in suffix:
            root /= part
        roots.append(root)
    return roots


def _git_roots_from_git_executable() -> list[Path]:
    roots: list[Path] = []
    for name in ("git.exe", "git"):
        git = _which_path(name)
        if not str(git):
            continue
        parent = git.parent
        root = parent.parent if parent.name.lower() in {"cmd", "bin"} else Path()
        if root.name.lower() in {"git", "portablegit"}:
            roots.append(root)
    return roots


def _which_path(name: str) -> Path:
    found = shutil.which(name)
    return Path(found) if found else Path()


def _dedupe_paths(paths: list[Path]) -> list[Path]:
    seen: set[str] = set()
    result: list[Path] = []
    for path in paths:
        text = str(path).strip()
        if not text:
            continue
        key = text.lower() if sys.platform == "win32" else text
        if key in seen:
            continue
        seen.add(key)
        result.append(path)
    return result


def _looks_like_shell(shell: CommandShell, path: Path) -> bool:
    name = path.name.lower()
    if shell == "cmd":
        return name in {"cmd.exe", "cmd"}
    if shell == "powershell":
        return name in {"pwsh.exe", "pwsh", "powershell.exe", "powershell"}
    return name in {"bash.exe", "bash"} and _is_git_bash_path(path)


def _is_git_bash_path(path: Path) -> bool:
    if not str(path):
        return False
    name = path.name.lower()
    if name not in {"bash.exe", "bash"}:
        return False
    parts = [part.lower() for part in path.parts]
    for index, part in enumerate(parts):
        if part not in {"git", "portablegit"}:
            continue
        suffix = parts[index + 1 :]
        if suffix in (["bin", name], ["usr", "bin", name]):
            return True
    return False


def _validation_args(shell: CommandShell, path: Path) -> list[str]:
    if shell == "cmd":
        return [str(path), "/d", "/s", "/c", "echo keydex"]
    if shell == "powershell":
        command = (
            "$edition = if ($PSVersionTable.PSEdition) { $PSVersionTable.PSEdition } "
            "else { 'Desktop' }; "
            "Write-Output ('KEYDEX_PS_EDITION=' + $edition); "
            "Write-Output ('KEYDEX_PS_VERSION=' + $PSVersionTable.PSVersion.ToString()); "
            "Write-Output 'keydex'"
        )
        return [str(path), "-NoProfile", "-NonInteractive", "-Command", command]
    return [str(path), "-c", "echo keydex; git --version"]


def _label_from_validation(
    shell: CommandShell,
    path: Path,
    stdout: str,
) -> tuple[str, str | None, str | None]:
    if shell == "cmd":
        return "Windows CMD", None, None
    if shell == "git_bash":
        version = _extract_git_version(stdout)
        return "Git Bash", "git-bash", version
    edition = _extract_prefixed(stdout, "KEYDEX_PS_EDITION=") or None
    version = _extract_prefixed(stdout, "KEYDEX_PS_VERSION=") or None
    if path.name.lower().startswith("pwsh"):
        label = "PowerShell 7+"
        edition = edition or "Core"
    else:
        label = "Windows PowerShell 5.1"
        edition = edition or "Desktop"
    return label, edition, version


def _extract_prefixed(text: str, prefix: str) -> str:
    for line in text.splitlines():
        if line.startswith(prefix):
            return line[len(prefix) :].strip()
    return ""


def _invalid(
    shell: CommandShell,
    error: str,
    diagnostics: list[str],
) -> ShellDiscoveryResult:
    return ShellDiscoveryResult(shell=shell, found=False, diagnostics=list(diagnostics), error=error)


def _not_found_message(shell: CommandShell, *, manual: bool) -> str:
    if manual:
        return "所选 executable 无法通过当前 shell 类型校验"
    if shell == "cmd":
        return "未找到 cmd.exe，请手动选择 Windows CMD executable"
    if shell == "powershell":
        return "未找到 pwsh.exe 或 powershell.exe，请手动选择 PowerShell executable"
    return "未找到 Git Bash，请安装 Git for Windows 或手动选择 Git 安装目录下的 bash.exe"


def _type_mismatch_message(shell: CommandShell, path: Path) -> str:
    if shell == "cmd":
        return f"所选文件不是 cmd.exe: {path.name}"
    if shell == "powershell":
        return f"所选文件不是 pwsh.exe 或 powershell.exe: {path.name}"
    return f"所选文件不是 Git Bash 的 bash.exe: {path.name}"


def _extract_git_version(text: str) -> str | None:
    for line in text.splitlines():
        cleaned = line.strip()
        if cleaned.lower().startswith("git version "):
            return cleaned[len("git version ") :].strip() or None
    return None


def _decode(value: bytes) -> str:
    for encoding in ("utf-8", "gb18030", sys.getdefaultencoding()):
        try:
            return value.decode(encoding)
        except UnicodeDecodeError:
            continue
    return value.decode("utf-8", errors="replace")


def _creationflags() -> int:
    if sys.platform != "win32":
        return 0
    return getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _startupinfo() -> subprocess.STARTUPINFO | None:
    if sys.platform != "win32":
        return None
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = subprocess.SW_HIDE
    return startupinfo
