# RHCSA Examination Platform

A full-stack web application for practicing and testing RHCSA (Red Hat Certified System Administrator) exam tasks. The platform provides an interactive terminal environment running in Docker containers, automated task validation, and a modern web interface.

## 🚀 Features

- **Interactive Terminal**: Real-time terminal access to AlmaLinux 9 containers via WebSocket
- **Task Management**: 20 predefined RHCSA exam tasks covering NODE1 and NODE2 scenarios
- **Automated Validation**: Built-in checker framework for verifying task completion
- **Container Lifecycle**: Start, stop, and reset containers for each task
- **Modern UI**: Responsive React frontend with panel-based layout
- **Real-time Updates**: Socket.IO for live terminal streaming and status updates

## 🏗️ Architecture

```
┌─────────────────┐
│  React Frontend │  (Vite + TypeScript)
│  (Port 5000)    │
└────────┬────────┘
         │ HTTP/WebSocket
         ▼
┌─────────────────┐
│  Flask Backend  │  (Flask + Flask-SocketIO)
│  (Port 5000)    │
└────────┬────────┘
         │ Docker API
         ▼
┌─────────────────┐
│  Docker Engine  │
│  AlmaLinux:9    │
└─────────────────┘
```

### Technology Stack

**Backend:**
- Flask 3.0+ - Web framework
- Flask-SocketIO 5.3+ - WebSocket support
- Docker SDK 7.0+ - Container management
- Python 3.8+

**Frontend:**
- React 19.2+ - UI framework
- TypeScript 5.8+ - Type safety
- Vite 6.2+ - Build tool
- xterm.js 5.3+ - Terminal emulator
- Socket.IO Client 4.7+ - WebSocket client
- Tailwind CSS - Styling (via CDN)

## 📋 Prerequisites

- **Python 3.8+** with pip
- **Node.js 18+** and npm
- **Docker Desktop** (Windows/Mac) or **Docker Engine** (Linux)
- **Git** (optional, for cloning)

## 🔧 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd RCHSA_LAB_Final
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install Python dependencies
pip install -r requirements.txt
```

### 3. Frontend Setup

```bash
# Navigate to frontend directory
cd ../frontend

# Install Node.js dependencies
npm install

# Build frontend (outputs to backend/frontend_dist/)
npm run build
```

## 🚀 Running the Application

### Start the Server

From the project root:

```bash
python backend/app.py
```

Or from the backend directory:

```bash
cd backend
python app.py
```

The server will start on **http://localhost:5000**

### Access the Application

Open your browser and navigate to:
```
http://localhost:5000
```

## 📖 Usage Guide

### Starting a Task

1. Select a task from the task list (left panel)
2. Review the task instructions
3. Click **Start** to launch the container
4. Wait for the container to be ready (status changes to "RUNNING")

### Using the Terminal

1. Once a task is running, the terminal panel becomes active
2. Type commands directly in the terminal
3. The terminal connects automatically via WebSocket
4. Commands execute in the AlmaLinux 9 container

### Stopping/Resetting

- **Stop**: Stops the container (terminal disconnects)
- **Reset**: Recreates the container from scratch (useful for starting fresh)
- **Check**: Validates task completion against predefined checkers

### Task Validation

Click **Verify Task Completion** to run automated checks:
- Returns `PASS`, `FAIL`, or `ERROR` status
- Shows detailed check results with pass/fail indicators
- Displays timestamp and summary

## 🔌 API Documentation

### REST Endpoints

#### `GET /api/docker/status`
Check Docker daemon availability.

**Response:**
```json
{
  "available": true,
  "version": "29.1.5"
}
```

#### `GET /api/tasks`
Get all tasks with current status.

**Response:**
```json
[
  {
    "id": 1,
    "node": "NODE1",
    "title": "Network Configuration",
    "instructions": "...",
    "status": "running",
    "lastCheck": null
  }
]
```

#### `POST /api/task/<id>/start`
Start a task container.

**Response:**
```json
{
  "ok": true,
  "status": "running"
}
```

#### `POST /api/task/<id>/stop`
Stop a task container.

**Response:**
```json
{
  "ok": true,
  "status": "stopped"
}
```

#### `POST /api/task/<id>/reset`
Reset (recreate) a task container.

**Response:**
```json
{
  "ok": true,
  "status": "running"
}
```

#### `POST /api/task/<id>/check`
Validate task completion.

**Response:**
```json
{
  "status": "PASS|FAIL|ERROR",
  "summary": "2/2 checks passed.",
  "timestamp": "2026-02-01T09:33:08.312863+00:00",
  "details": [
    {
      "name": "Hostname",
      "passed": true,
      "message": "Hostname is 'node1.example.com'"
    }
  ]
}
```

### WebSocket Events

#### Client → Server

- `terminal:connect` - Connect to task terminal
  ```json
  { "taskId": 1 }
  ```

- `terminal:input` - Send terminal input
  ```json
  { "taskId": 1, "data": "ls\n" }
  ```

- `terminal:resize` - Resize terminal
  ```json
  { "taskId": 1, "cols": 80, "rows": 24 }
  ```

#### Server → Client

- `terminal:output` - Terminal output data
  ```json
  { "taskId": 1, "data": "root@node1 ~# " }
  ```

- `terminal:exit` - Terminal process exited
  ```json
  { "taskId": 1, "code": 0 }
  ```

- `terminal:error` - Terminal error
  ```json
  { "taskId": 1, "message": "Container not running" }
  ```

## 📁 Project Structure

```
RCHSA_LAB_Final/
├── backend/
│   ├── app.py                 # Flask application & Socket.IO handlers
│   ├── task_checkers.py      # Task validation framework
│   ├── tasks_data.py          # Task definitions
│   ├── requirements.txt       # Python dependencies
│   └── frontend_dist/         # Built frontend (generated)
│       ├── index.html
│       └── assets/
│
├── frontend/
│   ├── App.tsx               # Main React component
│   ├── components/
│   │   ├── Terminal.tsx      # Terminal component
│   │   └── Icon.tsx          # Icon components
│   ├── services/
│   │   └── dockerService.ts  # API client
│   ├── types.ts              # TypeScript types
│   ├── constants.tsx         # Task constants
│   ├── package.json          # Node.js dependencies
│   └── vite.config.ts        # Vite configuration
│
└── README.md
```

## 🐳 Docker Configuration

### Container Naming
Containers are named: `rhcsa-task-<id>` (e.g., `rhcsa-task-1`)

### Base Image
- **Image**: `almalinux:9`
- **Command**: `sleep infinity` (keeps container running)

### Container Lifecycle
- Containers persist between sessions
- Reset recreates containers from scratch
- Stop pauses containers (can be restarted)

## 🧪 Task Checkers

The checker framework (`task_checkers.py`) provides:

- **Deterministic checks** via `docker exec`
- **Modular checker functions** per task
- **Structured results** with pass/fail details

### Example Checker

```python
def checker_task1(container_name: str) -> CheckResult:
    """Network config: hostname node1.example.com, IP 192.168.122.10."""
    details = [
        run_check(container_name, "Hostname", lambda c: check_hostname(c, "node1.example.com")),
        run_check(container_name, "IP configuration", lambda c: _check_ip(c)),
    ]
    # ... returns CheckResult
```

## 🛠️ Development

### Frontend Development

```bash
cd frontend
npm run dev  # Starts Vite dev server on port 3000
```

**Note:** For production, always run `npm run build` to update `backend/frontend_dist/`

### Backend Development

The Flask app runs in debug mode by default:
- Auto-reloads on file changes
- Debugger enabled
- Detailed error messages

### Adding New Tasks

1. Add task definition to `backend/tasks_data.py`
2. Optionally add custom checker to `backend/task_checkers.py`
3. Restart the server

### Adding New Checkers

1. Create checker function in `task_checkers.py`
2. Register in `_CHECKERS` dictionary
3. Use helper functions: `check_hostname`, `check_file_exists`, `check_user_exists`, etc.

## 🐛 Troubleshooting

### Docker Not Available

**Error:** `"available": false` in `/api/docker/status`

**Solutions:**
- Ensure Docker Desktop/Engine is running
- Check Docker daemon is accessible: `docker ps`
- On Linux, ensure user is in `docker` group

### Terminal Not Connecting

**Symptoms:** Terminal shows "Connecting..." but never connects

**Solutions:**
- Check container is running: `docker ps | grep rhcsa-task`
- Verify WebSocket connection in browser DevTools
- Check server logs for errors

### Frontend Not Loading

**Error:** "Frontend not built" message

**Solution:**
```bash
cd frontend
npm run build
```

### Port Already in Use

**Error:** `Address already in use`

**Solutions:**
- Change `PORT` in `backend/app.py`
- Kill existing process: `lsof -ti:5000 | xargs kill` (Linux/Mac)

## 📝 Notes

- **Terminal Clearing**: Terminal automatically clears when Start/Stop/Reset is clicked
- **State Persistence**: Task status is stored in memory (resets on server restart)
- **Container Persistence**: Containers persist between server restarts
- **SPA Routing**: All routes serve `index.html` for client-side routing

## 🔒 Security Considerations

- **Development Only**: This application is designed for local development/practice
- **No Authentication**: No user authentication implemented
- **Docker Access**: Requires Docker socket access (security risk in production)
- **CORS**: Currently allows all origins (`*`) - restrict in production

## 📄 License

[Specify your license here]

## 👥 Contributing

[Add contribution guidelines if applicable]

## 📧 Support

[Add support/contact information if applicable]

---

**Built with ❤️ for RHCSA exam preparation**
