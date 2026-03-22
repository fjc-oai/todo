# External Brain

A task tracking web app with the same repo shape as `3000r`:

- `frontend/`: React + Vite + plain JSX
- `backend/`: FastAPI + SQLite

## Commands

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Or use the helper script:

```bash
./dev.sh build
./dev.sh serve
./dev.sh start
```

Background mode:

```bash
./dev.sh install-cli
todo start
todo status
todo logs
todo stop
todo restart
```

`todo start` builds the frontend and runs the backend in the background on `http://localhost:8000`.

## MVP

- quick capture to backlog
- `Today`, `Due Soon`, `Blocked`, `Backlog`
- `Work` and `Life`
- due dates and follow-up times
- `open` / `done` status
- task types: `main`, `backlog`, `blocked`, `deadline`
- persistence in `backend/app.db`
