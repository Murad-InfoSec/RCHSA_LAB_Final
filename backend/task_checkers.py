"""
Checker framework for RHCSA tasks. Runs deterministic checks via docker exec
and returns structured CheckResult (status, summary, timestamp, details).
"""
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, List, Optional


@dataclass
class CheckDetail:
    name: str
    passed: bool
    message: str


@dataclass
class CheckResult:
    status: str  # "PASS" | "FAIL" | "ERROR"
    summary: str
    timestamp: str
    details: List[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "summary": self.summary,
            "timestamp": self.timestamp,
            "details": self.details,
        }


def docker_exec(container_name: str, cmd: List[str], timeout: int = 10) -> tuple[int, str, str]:
    """Run command in container via docker exec. Returns (exit_code, stdout, stderr)."""
    full_cmd = ["docker", "exec", container_name] + cmd
    try:
        r = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return r.returncode, (r.stdout or ""), (r.stderr or "")
    except subprocess.TimeoutExpired:
        return -1, "", "command timed out"
    except FileNotFoundError:
        return -1, "", "docker not found"
    except Exception as e:
        return -1, "", str(e)


def run_check(
    container_name: str,
    name: str,
    check_fn: Callable[[str], tuple[bool, str]],
) -> CheckDetail:
    """Run a single check and return CheckDetail."""
    try:
        passed, message = check_fn(container_name)
        return CheckDetail(name=name, passed=passed, message=message)
    except Exception as e:
        return CheckDetail(name=name, passed=False, message=f"Check error: {e}")


# ---------- Generic deterministic checks (examples) ----------


def check_hostname(container_name: str, expected: str = "node1.example.com") -> tuple[bool, str]:
    code, out, err = docker_exec(container_name, ["hostname", "-f"])
    out = (out or "").strip()
    if code != 0:
        return False, err or f"hostname failed (exit {code})"
    if out == expected:
        return True, f"Hostname is '{out}'"
    return False, f"Expected '{expected}', got '{out}'"


def check_file_exists(container_name: str, path: str) -> tuple[bool, str]:
    code, _, _ = docker_exec(container_name, ["test", "-f", path])
    if code == 0:
        return True, f"File {path} exists"
    code2, _, _ = docker_exec(container_name, ["test", "-d", path])
    if code2 == 0:
        return True, f"Path {path} exists (directory)"
    return False, f"Path {path} not found"


def check_file_contains(container_name: str, path: str, substring: str) -> tuple[bool, str]:
    code, out, err = docker_exec(container_name, ["grep", "-q", substring, path])
    if code == 0:
        return True, f"'{substring}' found in {path}"
    return False, f"'{substring}' not found in {path} or file missing"


def check_user_exists(container_name: str, user: str) -> tuple[bool, str]:
    code, _, _ = docker_exec(container_name, ["id", "-u", user])
    if code == 0:
        return True, f"User '{user}' exists"
    return False, f"User '{user}' not found"


def check_group_exists(container_name: str, group: str) -> tuple[bool, str]:
    code, _, _ = docker_exec(container_name, ["getent", "group", group])
    if code == 0:
        return True, f"Group '{group}' exists"
    return False, f"Group '{group}' not found"


def check_service_active(container_name: str, service: str) -> tuple[bool, str]:
    code, out, _ = docker_exec(container_name, ["systemctl", "is-active", "--quiet", service])
    if code == 0:
        return True, f"Service '{service}' is active"
    return False, f"Service '{service}' is not active"


def check_listening_port(container_name: str, port: int) -> tuple[bool, str]:
    code, out, _ = docker_exec(container_name, ["ss", "-tlnp"])
    if code != 0:
        code, out, _ = docker_exec(container_name, ["netstat", "-tlnp"])
    if str(port) in (out or ""):
        return True, f"Port {port} is listening"
    return False, f"Port {port} is not listening"


# ---------- Per-task checker registry ----------

def get_checker(task_id: int):
    """Return a checker function for the given task_id, or a default checker."""
    return _CHECKERS.get(task_id, default_checker)


def default_checker(container_name: str) -> CheckResult:
    """Default deterministic checker: hostname + basic file checks."""
    details = [
        run_check(container_name, "Container reachable", lambda c: (True, "Container is running")),
        run_check(container_name, "Hostname", lambda c: check_hostname(c)),
        run_check(container_name, "Root home", lambda c: check_file_exists(c, "/root")),
    ]
    passed = sum(1 for d in details if d.passed)
    total = len(details)
    status = "PASS" if passed == total else "FAIL"
    summary = f"{passed}/{total} checks passed." if total else "No checks run."
    return CheckResult(
        status=status,
        summary=summary,
        timestamp=datetime.now(tz=timezone.utc).isoformat(),
        details=[{"name": d.name, "passed": d.passed, "message": d.message} for d in details],
    )


def checker_task1(container_name: str) -> CheckResult:
    """Network config: hostname node1.example.com, IP 192.168.122.10."""
    details = [
        run_check(container_name, "Hostname", lambda c: check_hostname(c, "node1.example.com")),
        run_check(container_name, "IP configuration", lambda c: _check_ip(c)),
    ]
    passed = sum(1 for d in details if d.passed)
    status = "PASS" if passed == len(details) else "FAIL"
    return CheckResult(
        status=status,
        summary=f"{passed}/{len(details)} checks passed.",
        timestamp=datetime.now(tz=timezone.utc).isoformat(),
        details=[{"name": d.name, "passed": d.passed, "message": d.message} for d in details],
    )


def _check_ip(container_name: str) -> tuple[bool, str]:
    code, out, _ = docker_exec(container_name, ["ip", "-4", "addr", "show"])
    if "192.168.122.10" in (out or ""):
        return True, "IP 192.168.122.10 configured"
    return False, "IP 192.168.122.10 not found in interfaces"


def checker_task4(container_name: str) -> CheckResult:
    """Users & groups: sysadmin, alice, bob."""
    details = [
        run_check(container_name, "Group sysadmin", lambda c: check_group_exists(c, "sysadmin")),
        run_check(container_name, "User alice", lambda c: check_user_exists(c, "alice")),
        run_check(container_name, "User bob", lambda c: check_user_exists(c, "bob")),
        run_check(container_name, "alice in sysadmin", lambda c: _user_in_group(c, "alice", "sysadmin")),
        run_check(container_name, "bob in sysadmin", lambda c: _user_in_group(c, "bob", "sysadmin")),
    ]
    passed = sum(1 for d in details if d.passed)
    status = "PASS" if passed == len(details) else "FAIL"
    return CheckResult(
        status=status,
        summary=f"{passed}/{len(details)} checks passed.",
        timestamp=datetime.now(tz=timezone.utc).isoformat(),
        details=[{"name": d.name, "passed": d.passed, "message": d.message} for d in details],
    )


def _user_in_group(container_name: str, user: str, group: str) -> tuple[bool, str]:
    code, out, _ = docker_exec(container_name, ["id", "-Gn", user])
    if group in (out or "").split():
        return True, f"User {user} is in group {group}"
    return False, f"User {user} not in group {group}"


def checker_task5(container_name: str) -> CheckResult:
    """Shared directory /home/shared, group sysadmin, setgid."""
    details = [
        run_check(container_name, "Directory exists", lambda c: check_file_exists(c, "/home/shared")),
        run_check(container_name, "Group ownership", lambda c: _dir_group_owner(c, "/home/shared", "sysadmin")),
        run_check(container_name, "setgid bit", lambda c: _has_setgid(c, "/home/shared")),
    ]
    passed = sum(1 for d in details if d.passed)
    status = "PASS" if passed == len(details) else "FAIL"
    return CheckResult(
        status=status,
        summary=f"{passed}/{len(details)} checks passed.",
        timestamp=datetime.now(tz=timezone.utc).isoformat(),
        details=[{"name": d.name, "passed": d.passed, "message": d.message} for d in details],
    )


def _dir_group_owner(container_name: str, path: str, group: str) -> tuple[bool, str]:
    code, out, _ = docker_exec(container_name, ["stat", "-c", "%G", path])
    g = (out or "").strip()
    if g == group:
        return True, f"Group owner is {group}"
    return False, f"Group owner is {g}, expected {group}"


def _has_setgid(container_name: str, path: str) -> tuple[bool, str]:
    code, out, _ = docker_exec(container_name, ["stat", "-c", "%a", path])
    mode = (out or "").strip()
    # directory setgid is 2 in first digit: 2xxx or 2777 etc
    if len(mode) >= 3 and int(mode[0]) >= 2:
        return True, f"setgid or setuid set (mode {mode})"
    return False, f"setgid not set (mode {mode})"


_CHECKERS = {
    1: checker_task1,
    4: checker_task4,
    5: checker_task5,
}
