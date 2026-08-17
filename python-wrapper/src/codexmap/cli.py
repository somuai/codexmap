from __future__ import annotations

import os
import shutil
import subprocess
import sys

from . import NODE_PACKAGE_SPEC

SAFE_COMMANDS = {
    "help",
    "--help",
    "-h",
    "doctor",
    "engines",
    "setup",
    "init",
    "index",
    "ask",
    "context",
    "diff",
    "onboard",
    "sessions",
    "clean",
}


def _flag_value(args: list[str], name: str) -> str | None:
    prefix = f"{name}="
    for index, arg in enumerate(args):
        if arg == name and index + 1 < len(args):
            return args[index + 1]
        if arg.startswith(prefix):
            return arg[len(prefix):]
    return None


def _first_command(args: list[str]) -> str:
    for arg in args:
        if not arg.startswith("-"):
            return arg
    return "help"


def _uses_fake_engine(args: list[str]) -> bool:
    return _flag_value(args, "--engine") == "fake"


def _requires_codex(args: list[str]) -> bool:
    command = _first_command(args)
    if command in SAFE_COMMANDS:
        return False
    return not _uses_fake_engine(args)


def _build_env() -> dict[str, str]:
    env = os.environ.copy()
    if env.get("OPENAI_API_KEY") and not env.get("CODEX_API_KEY"):
        env["CODEX_API_KEY"] = env["OPENAI_API_KEY"]
    if env.get("CODEX_API_KEY") and not env.get("OPENAI_API_KEY"):
        env["OPENAI_API_KEY"] = env["CODEX_API_KEY"]
    return env


def _fail_missing(lines: list[str]) -> int:
    print("CodexMap could not start:", file=sys.stderr)
    for line in lines:
        print(f"- {line}", file=sys.stderr)
    return 1


def _validate(args: list[str], env: dict[str, str]) -> int:
    missing: list[str] = []

    if not shutil.which("node"):
        missing.append("Install Node.js 18+ from https://nodejs.org/")
    if not shutil.which("npx"):
        missing.append("Install npm/npx; it is normally bundled with Node.js.")

    if _requires_codex(args):
        if not shutil.which("codex"):
            missing.append("Install OpenAI Codex CLI and make sure `codex` is on PATH.")
        if not (env.get("OPENAI_API_KEY") or env.get("CODEX_API_KEY")):
            missing.append("Set OPENAI_API_KEY or CODEX_API_KEY for real Codex runs.")

    if missing:
        return _fail_missing(missing)
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    env = _build_env()
    validation_code = _validate(args, env)
    if validation_code:
        return validation_code

    npx = shutil.which("npx") or "npx"
    package_spec = env.get("CODEXMAP_NPM_SPEC") or NODE_PACKAGE_SPEC
    command = [npx, "-y", package_spec, *args]
    try:
        return subprocess.run(command, env=env).returncode
    except KeyboardInterrupt:
        return 130
