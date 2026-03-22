# External Brain

External Brain is a personal task system designed to act as an external brain:

Decide today, and let the system carry the rest of the mental load.

The core idea is simple:
- keep all tasks in one trusted place
- separate what matters today from what should merely be remembered
- reduce the amount of work you have to do in your head

This project is intentionally not a team project manager, not a note-taking app, and not a generic kanban board. It is a laptop-first personal system for deciding what to do today while safely holding everything else.

## Product Principle

The app is built around a few working assumptions:

- A todo app should reduce anxiety, not create more bookkeeping.
- `Today` should be explicit. Important work does not always have a deadline.
- `Blocked` and `Deadline` are different states and should be treated differently.
- `Work` and `Life` should live in one system, but remain visually distinct.
- Projects are lightweight collections of tasks, not full planning objects.
- Finished work should remain visible in a simple reverse-chronological log.

In practice, the app tries to answer these questions quickly:

- What should I do today?
- What is blocked and needs a check-back?
- What is due today?
- What did I finish today?
- Where do I put a new task so I can stop thinking about it?

## Use Cases

This app is meant for personal task tracking such as:

- work tasks you actively want to push forward
- blocked items that need follow-up later
- life tasks with a real due date
- backlog items worth keeping but not acting on yet
- lightweight projects that group related tasks
- a small daily note area for freeform notes or manual daily recording

Current task model:

- `area`: `work` or `life`
- `status`: `open` or `done`
- `type`:
  - work tasks: `main`, `blocked`, `deadline`, `backlog`
  - life tasks: `blocked`, `deadline`, `backlog`
- optional `project`
- optional `due date`
- optional `check back`
- optional `today` selection

## How To Use The App

The main views are:

- `Today`
  - work and life tasks selected for today
  - blocked items that need action today
  - deadline items due today
  - tasks closed today
  - a manual `Today notes` box
- `All Tasks`
  - full open inventory, grouped by area and type
- `Areas`
  - focused views for only work or only life
- `Types`
  - focused views for `main`, `blocked`, `deadline`, or `backlog`
- `Done`
  - finished tasks, sorted by close time
- `Projects`
  - lightweight collections of tasks, with open/closed state

Typical workflow:

1. In the morning, open `All Tasks` and choose what belongs in `Today`.
2. Work from the `Today` view.
3. Reorder items inside a Today category by drag and drop.
4. Close tasks as you finish them.
5. Use `Closed today` plus `Today notes` as a lightweight daily record.
6. Capture new tasks quickly without needing to decide everything immediately.

Quick capture behavior:

- creating from `Today` makes the task a Today task immediately
- creating from other tabs leaves it as a normal open task
- work defaults to `main`
- life defaults to `backlog`

## Commands

### App Development

The main helper script is [dev.sh](/Users/fjc/code/todo/dev.sh).

Common commands:

```bash
./dev.sh build
```

- builds the frontend
- copies the build output into `backend/frontend/dist`

```bash
./dev.sh serve
```

- ensures the Python virtualenv exists
- installs backend dependencies if needed
- starts the backend in foreground dev mode

```bash
./dev.sh start
```

- builds the frontend
- starts the backend in foreground dev mode

This is the normal local dev flow if you want one command and are fine with a foreground process.

### Background Runtime

You can install a small wrapper command once:

```bash
./dev.sh install-cli
```

That installs:

- `todo` at `~/.local/bin/todo`

If `todo` is not found in a fresh shell, add this to your shell profile:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Then the main commands are:

```bash
todo start
todo stop
todo restart
todo status
todo logs
```

What they do:

- `todo start`
  - builds the frontend
  - ensures the backend environment exists
  - starts the app in the background on `http://localhost:8000`
- `todo stop`
  - stops the background server
- `todo restart`
  - restarts the background server
- `todo status`
  - shows whether the background server is running
- `todo logs`
  - tails the background server log

Runtime files:

- pid file: [/Users/fjc/code/todo/.runtime/todo.pid](/Users/fjc/code/todo/.runtime/todo.pid)
- log file: [/Users/fjc/code/todo/.runtime/todo.log](/Users/fjc/code/todo/.runtime/todo.log)

## Architecture

The app is split into two parts:

- `frontend/`
  - React
  - Vite
  - plain JSX
  - CSS
- `backend/`
  - FastAPI
  - SQLite
  - SQLAlchemy Core

### Frontend

Main frontend file:

- [frontend/src/App.jsx](/Users/fjc/code/todo/frontend/src/App.jsx)

What it currently handles:

- task loading and mutations
- projects and project assignment
- Today ordering
- Today notes
- sidebar navigation
- task detail editing
- rendering grouped task views

Styling lives mainly in:

- [frontend/src/App.css](/Users/fjc/code/todo/frontend/src/App.css)
- [frontend/src/index.css](/Users/fjc/code/todo/frontend/src/index.css)

### Backend

Main backend file:

- [backend/app.py](/Users/fjc/code/todo/backend/app.py)

It provides:

- task CRUD
- project CRUD
- daily note storage
- SQLite schema setup and migration
- serving the built frontend in production-style mode

Current API surface includes:

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/{id}`
- `DELETE /api/tasks/{id}`
- `GET /api/projects`
- `POST /api/projects`
- `PATCH /api/projects/{id}`
- `GET /api/daily-notes/{date}`
- `PUT /api/daily-notes/{date}`
- `GET /api/healthz`

### Data Model

Important persisted objects:

- `tasks`
  - title, details, area, status, type
  - due/check-back dates
  - today selection and ordering
  - optional project
  - completion time
- `projects`
  - title, area, status
- `daily_notes`
  - one saved note per day

## Local Setup

Frontend only:

```bash
cd frontend
npm install
npm run dev
```

Backend only:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Simplest combined flow:

```bash
./dev.sh start
```

Then open:

- [http://localhost:8000](http://localhost:8000)

## Current Scope

This project is intentionally optimized for:

- one user
- one laptop/browser-centered workflow
- low-friction task capture
- clear Today planning
- simple project grouping

It is intentionally not trying to be:

- multi-user
- collaborative
- calendar-driven
- heavily configurable
- a full project-planning system
