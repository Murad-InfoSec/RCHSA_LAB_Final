"""
Flask + Flask-SocketIO backend for RHCSA Examination Platform.
Serves built Vite React frontend from frontend_dist/ and provides REST + Socket.IO API.
"""
import os
import subprocess
import threading
from copy import deepcopy

import docker
from flask import Flask, jsonify, request, send_from_directory
from flask_socketio import SocketIO, emit, join_room

from tasks_data import TASKS
from task_checkers import get_checker, CheckResult

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend_dist")
CONTAINER_IMAGE = "almalinux:9"
CONTAINER_PREFIX = "rhcsa-task-"
PORT = 5000

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# In-memory state: task id -> { status, lastCheck }
_task_state: dict[int, dict] = {}
for t in TASKS:
    _task_state[t["id"]] = {"status": t["status"], "lastCheck": t["lastCheck"]}

# Terminal sessions: task_id -> { process, thread }
_terminal_sessions: dict[str, subprocess.Popen | None] = {}
_terminal_lock = threading.Lock()


def _container_name(task_id: int) -> str:
    return f"{CONTAINER_PREFIX}{task_id}"


def _get_docker_client():
    try:
        return docker.from_env()
    except Exception as e:
        return None


# ---------------------------------------------------------------------------
# Docker helpers
# ---------------------------------------------------------------------------
def ensure_container(task_id: int) -> tuple[bool, str]:
    """Ensure container exists and is running. Create from almalinux:9 if needed."""
    name = _container_name(task_id)
    try:
        client = docker.from_env()
    except Exception as e:
        return False, str(e)
    try:
        c = client.containers.get(name)
        if c.status != "running":
            c.start()
        return True, ""
    except docker.errors.NotFound:
        pass
    try:
        client.containers.run(
            CONTAINER_IMAGE,
            name=name,
            detach=True,
            tty=True,
            command=["sleep", "infinity"],
            remove=False,
        )
        return True, ""
    except Exception as e:
        return False, str(e)


def stop_container(task_id: int) -> tuple[bool, str]:
    name = _container_name(task_id)
    try:
        client = docker.from_env()
        c = client.containers.get(name)
        c.stop()
        return True, ""
    except docker.errors.NotFound:
        return True, ""
    except Exception as e:
        return False, str(e)


def reset_container(task_id: int) -> tuple[bool, str]:
    name = _container_name(task_id)
    try:
        client = docker.from_env()
        c = client.containers.get(name)
        c.stop()
        c.remove()
    except (docker.errors.NotFound, docker.errors.APIError):
        pass
    return ensure_container(task_id)


# ---------------------------------------------------------------------------
# REST API
# ---------------------------------------------------------------------------
@app.route("/api/docker/status")
def docker_status():
    out = {"available": False}
    try:
        client = docker.from_env()
        out["version"] = client.version().get("Version", "")
        out["available"] = True
    except Exception as e:
        out["error"] = str(e)
    return jsonify(out)


@app.route("/api/tasks")
def api_tasks():
    result = []
    for t in TASKS:
        tid = t["id"]
        state = _task_state.get(tid, {"status": "idle", "lastCheck": None})
        result.append({
            "id": t["id"],
            "node": t["node"],
            "title": t["title"],
            "instructions": t["instructions"],
            "status": state["status"],
            "lastCheck": state["lastCheck"],
        })
    return jsonify(result)


@app.route("/api/task/<int:task_id>/start", methods=["POST"])
def task_start(task_id):
    ok, err = ensure_container(task_id)
    if not ok:
        return jsonify({"ok": False, "error": err}), 500
    _task_state[task_id]["status"] = "running"
    return jsonify({"ok": True, "status": "running"})


@app.route("/api/task/<int:task_id>/stop", methods=["POST"])
def task_stop(task_id):
    _close_terminal(str(task_id))
    ok, err = stop_container(task_id)
    if not ok:
        return jsonify({"ok": False, "error": err}), 500
    _task_state[task_id]["status"] = "stopped"
    return jsonify({"ok": True, "status": "stopped"})


@app.route("/api/task/<int:task_id>/reset", methods=["POST"])
def task_reset(task_id):
    _close_terminal(str(task_id))
    ok, err = reset_container(task_id)
    if not ok:
        return jsonify({"ok": False, "error": err}), 500
    _task_state[task_id]["status"] = "running"
    return jsonify({"ok": True, "status": "running"})


@app.route("/api/task/<int:task_id>/check", methods=["POST"])
def task_check(task_id):
    name = _container_name(task_id)
    try:
        client = docker.from_env()
        client.containers.get(name)
    except Exception as e:
        return jsonify({
            "status": "ERROR",
            "summary": f"Container not available: {e}",
            "timestamp": __now(),
            "details": [],
        }), 200
    checker = get_checker(task_id)
    result = checker(name)
    if isinstance(result, CheckResult):
        result = result.to_dict()
    _task_state[task_id]["lastCheck"] = result
    return jsonify(result)


def __now():
    from datetime import datetime, timezone
    return datetime.now(tz=timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Static (SPA) – serve frontend_dist
# ---------------------------------------------------------------------------
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve(path):
    # Serve static files from frontend_dist
    if path:
        full_path = os.path.join(FRONTEND_DIST, path)
        if os.path.isfile(full_path):
            return send_from_directory(FRONTEND_DIST, path)
        if os.path.isdir(full_path):
            idx = os.path.join(full_path, "index.html")
            if os.path.isfile(idx):
                return send_from_directory(FRONTEND_DIST, os.path.join(path, "index.html"))
    # SPA fallback: serve index.html for any non-API, non-static path
    index = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.isfile(index):
        return send_from_directory(FRONTEND_DIST, "index.html")
    return "Frontend not built. Run from frontend: npm run build.", 404


# ---------------------------------------------------------------------------
# Terminal: docker exec stream
# ---------------------------------------------------------------------------
def _close_terminal(task_id: str):
    with _terminal_lock:
        sock = _terminal_sessions.pop(task_id, None)
    if sock:
        try:
            sock.close()
        except Exception:
            pass


def _reader_loop_docker(task_id: str, sock, sid: str):
    """Read output from docker exec socket and stream to client via Socket.IO."""
    import time
    try:
        # Set socket timeout for non-blocking reads
        sock.settimeout(0.1)
        
        while True:
            try:
                # Read from the socket (works for both regular sockets and NpipeSocket)
                data = sock.recv(4096)
                if not data:
                    break
                    
                text = data.decode("utf-8", errors="replace")
                socketio.emit("terminal:output", {"taskId": int(task_id), "data": text}, to=sid)
                
            except Exception as e:
                err_str = str(e).lower()
                if "timed out" in err_str or "timeout" in err_str:
                    # Timeout is expected, just continue
                    continue
                elif "connection" in err_str and ("reset" in err_str or "closed" in err_str):
                    break
                else:
                    raise
                
    except Exception as e:
        socketio.emit("terminal:error", {"taskId": int(task_id), "message": str(e)}, to=sid)
    finally:
        socketio.emit("terminal:exit", {"taskId": int(task_id), "code": 0}, to=sid)
        try:
            sock.close()
        except Exception:
            pass
        with _terminal_lock:
            _terminal_sessions.pop(task_id, None)


@socketio.on("terminal:connect")
def on_terminal_connect(data):
    task_id = str(data.get("taskId") or "")
    if not task_id:
        emit("terminal:error", {"taskId": 0, "message": "taskId required"})
        return
    room = f"terminal:{task_id}"
    join_room(room)
    name = _container_name(int(task_id))
    try:
        client = docker.from_env()
        c = client.containers.get(name)
        if c.status != "running":
            emit("terminal:error", {"taskId": int(task_id), "message": "Container not running"})
            return
    except Exception as e:
        emit("terminal:error", {"taskId": int(task_id), "message": str(e)})
        return
    _close_terminal(task_id)
    try:
        # Use docker SDK exec with streams for better control
        client = docker.from_env()
        container = client.containers.get(name)
        
        # Create exec instance with TTY
        exec_id = client.api.exec_create(
            container.id, 
            "/bin/bash",
            stdin=True,
            tty=True,
            stderr=True,
            stdout=True,
        )
        
        # Start exec with socket
        sock = client.api.exec_start(exec_id, socket=True, tty=True)
        
        with _terminal_lock:
            _terminal_sessions[task_id] = sock
        
        t = threading.Thread(target=_reader_loop_docker, args=(task_id, sock, request.sid))
        t.daemon = True
        t.start()
    except Exception as e:
        emit("terminal:error", {"taskId": int(task_id), "message": str(e)})


@socketio.on("terminal:input")
def on_terminal_input(data):
    task_id = str(data.get("taskId") or "")
    raw = data.get("data")
    if raw is None:
        raw = ""
    if isinstance(raw, str):
        raw = raw.encode("utf-8", errors="replace")
    with _terminal_lock:
        sock = _terminal_sessions.get(task_id)
    if sock:
        try:
            # Send data directly to socket (works for both regular and NpipeSocket)
            sock.send(raw)
        except Exception:
            pass


@socketio.on("terminal:resize")
def on_terminal_resize(data):
    task_id = data.get("taskId")
    cols = data.get("cols", 80)
    rows = data.get("rows", 24)
    name = _container_name(int(task_id))
    try:
        # Find exec id for current bash and resize (optional; docker exec resize)
        subprocess.run(
            ["docker", "exec", name, "sh", "-c", f"stty size 2>/dev/null || true"],
            capture_output=True,
            timeout=2,
        )
    except Exception:
        pass


@socketio.on("disconnect")
def on_disconnect():
    # Client automatically removed from all rooms on disconnect
    pass


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    if not os.path.isdir(FRONTEND_DIST):
        os.makedirs(FRONTEND_DIST, exist_ok=True)
    socketio.run(app, host="0.0.0.0", port=PORT, debug=True)
