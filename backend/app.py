import pathlib
from datetime import date, datetime, timedelta, timezone
from typing import List, Literal, Optional

import sqlalchemy as sa
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.responses import FileResponse, JSONResponse

app = FastAPI(title="External Brain backend")

ALLOW_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = sa.create_engine(
    "sqlite:///./app.db",
    connect_args={"check_same_thread": False},
)

VALID_STATUSES = {"open", "done"}
VALID_TYPES = {"main", "backlog", "blocked", "deadline"}

metadata = sa.MetaData()
tasks = sa.Table(
    "tasks",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("title", sa.String(255), nullable=False),
    sa.Column("details", sa.Text, nullable=False, server_default=""),
    sa.Column("area", sa.String(20), nullable=False),
    sa.Column("status", sa.String(20), nullable=False),
    sa.Column("task_type", sa.String(20), nullable=False),
    sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("follow_up_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("planned_for", sa.Date, nullable=True),
    sa.Column(
        "parent_id",
        sa.Integer,
        sa.ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=True,
    ),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1)
    details: str = ""
    area: Literal["work", "life"]
    status: Literal["open", "done"] = "open"
    task_type: Literal["main", "backlog", "blocked", "deadline"] = "backlog"
    due_at: Optional[datetime] = None
    follow_up_at: Optional[datetime] = None
    planned_for: Optional[date] = None
    parent_id: Optional[int] = None
    completed_at: Optional[datetime] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    details: Optional[str] = None
    area: Optional[Literal["work", "life"]] = None
    status: Optional[Literal["open", "done"]] = None
    task_type: Optional[Literal["main", "backlog", "blocked", "deadline"]] = None
    due_at: Optional[datetime] = None
    follow_up_at: Optional[datetime] = None
    planned_for: Optional[date] = None
    parent_id: Optional[int] = None
    completed_at: Optional[datetime] = None


class TaskOut(BaseModel):
    id: int
    title: str
    details: str
    area: Literal["work", "life"]
    status: Literal["open", "done"]
    task_type: Literal["main", "backlog", "blocked", "deadline"]
    due_at: Optional[datetime] = None
    follow_up_at: Optional[datetime] = None
    planned_for: Optional[date] = None
    parent_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def map_old_status(value: Optional[str]) -> str:
    if value == "done" or value == "archived":
        return "done"
    return "open"


def map_old_type(row) -> str:
    current = row.get("task_type")
    if current in VALID_TYPES:
        return current
    if current == "focus":
        return "main"

    old_engagement = row.get("engagement")
    if old_engagement == "waiting":
        return "blocked"
    if old_engagement == "parked":
        return "backlog"
    if row.get("due_at") is not None:
        return "deadline"
    if row.get("status") == "inbox":
        return "backlog"
    return "main"


def row_to_task(row) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "details": row.details or "",
        "area": row.area,
        "status": row.status,
        "task_type": "main" if row.task_type == "focus" else row.task_type,
        "due_at": row.due_at,
        "follow_up_at": row.follow_up_at,
        "planned_for": row.planned_for,
        "parent_id": row.parent_id,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "completed_at": row.completed_at,
    }


def normalize_area_task_type(area: str, task_type: str) -> str:
    if area == "life" and task_type == "main":
        return "backlog"
    return task_type


def get_task_or_404(conn, task_id: int):
    row = conn.execute(sa.select(tasks).where(tasks.c.id == task_id)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return row


def ensure_tasks_schema():
    inspector = sa.inspect(engine)
    table_names = inspector.get_table_names()

    if "tasks" not in table_names:
        metadata.create_all(engine)
        return

    columns = {column["name"] for column in inspector.get_columns("tasks")}
    expected = {
        "id",
        "title",
        "details",
        "area",
        "status",
        "task_type",
        "due_at",
        "follow_up_at",
        "planned_for",
        "parent_id",
        "created_at",
        "updated_at",
        "completed_at",
    }

    if expected.issubset(columns):
        return

    create_new_sql = """
    CREATE TABLE tasks_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title VARCHAR(255) NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      area VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL,
      task_type VARCHAR(20) NOT NULL,
      due_at DATETIME,
      follow_up_at DATETIME,
      planned_for DATE,
      parent_id INTEGER REFERENCES tasks_v2(id) ON DELETE CASCADE,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      completed_at DATETIME
    )
    """

    insert_sql = sa.text(
        """
        INSERT INTO tasks_v2 (
          id, title, details, area, status, task_type, due_at, follow_up_at,
          planned_for, parent_id, created_at, updated_at, completed_at
        ) VALUES (
          :id, :title, :details, :area, :status, :task_type, :due_at, :follow_up_at,
          :planned_for, :parent_id, :created_at, :updated_at, :completed_at
        )
        """
    )

    with engine.begin() as conn:
        conn.execute(sa.text("DROP TABLE IF EXISTS tasks_v2"))
        conn.execute(sa.text(create_new_sql))
        old_rows = conn.execute(sa.text("SELECT * FROM tasks ORDER BY id")).mappings().all()

        for row in old_rows:
            created_at = row.get("created_at") or utcnow()
            updated_at = row.get("updated_at") or created_at
            mapped = {
                "id": row["id"],
                "title": row["title"],
                "details": row.get("details") or row.get("notes") or "",
                "area": row.get("area") or "work",
                "status": row["status"]
                if row.get("status") in VALID_STATUSES
                else map_old_status(row.get("status")),
                "task_type": map_old_type(row),
                "due_at": row.get("due_at"),
                "follow_up_at": row.get("follow_up_at"),
                "planned_for": row.get("planned_for"),
                "parent_id": row.get("parent_id"),
                "created_at": created_at,
                "updated_at": updated_at,
                "completed_at": row.get("completed_at"),
            }
            conn.execute(insert_sql, mapped)

        conn.execute(sa.text("DROP TABLE tasks"))
        conn.execute(sa.text("ALTER TABLE tasks_v2 RENAME TO tasks"))


def normalize_task_rows():
    with engine.begin() as conn:
        rows = conn.execute(
            sa.select(
                tasks.c.id,
                tasks.c.status,
                tasks.c.task_type,
                tasks.c.due_at,
                tasks.c.follow_up_at,
                tasks.c.planned_for,
            )
        ).mappings().all()

        for row in rows:
            updates = {}
            normalized_status = (
                row["status"] if row["status"] in VALID_STATUSES else map_old_status(row["status"])
            )
            normalized_type = (
                row["task_type"] if row["task_type"] in VALID_TYPES else map_old_type(row)
            )

            if row["task_type"] == "focus":
                normalized_type = "main"

            normalized_type = normalize_area_task_type(row.get("area") or "work", normalized_type)

            if normalized_status != row["status"]:
                updates["status"] = normalized_status

            if normalized_type != row["task_type"]:
                updates["task_type"] = normalized_type

            if normalized_type != "deadline" and row["due_at"] is not None:
                updates["due_at"] = None

            if normalized_type != "blocked" and row["follow_up_at"] is not None:
                updates["follow_up_at"] = None

            if updates:
                conn.execute(sa.update(tasks).where(tasks.c.id == row["id"]).values(**updates))


def seed_initial_tasks():
    with engine.begin() as conn:
        existing = conn.execute(
            sa.select(sa.func.count()).select_from(tasks)
        ).scalar_one()
        if existing > 0:
            return

        now = utcnow()
        today = now.date()
        roadmap_result = conn.execute(
            sa.insert(tasks).values(
                title="Prepare Q2 roadmap draft",
                details="Turn a loose set of work ideas into a one-page roadmap before the team sync tomorrow.",
                area="work",
                status="open",
                task_type="main",
                planned_for=today,
                created_at=now,
                updated_at=now,
                completed_at=None,
            )
        )
        roadmap_id = roadmap_result.inserted_primary_key[0]

        seed_rows = [
            {
                "title": "Collect team themes",
                "details": "Pull the recurring asks from the past two weeks of notes.",
                "area": "work",
                "status": "open",
                "task_type": "main",
                "parent_id": roadmap_id,
            },
            {
                "title": "Draft the one-pager",
                "details": "Limit it to goals, bets, and risks.",
                "area": "work",
                "status": "open",
                "task_type": "main",
                "parent_id": roadmap_id,
            },
            {
                "title": "Read scheduler code paths",
                "details": "Start with wakeup and run-queue selection. Keep this in Today until the shape is clear.",
                "area": "work",
                "status": "open",
                "task_type": "main",
                "planned_for": today,
            },
            {
                "title": "Check CI on PR #184",
                "details": "The patch is done, but CI is red. Re-check after infra stabilizes before pushing another guess.",
                "area": "work",
                "status": "open",
                "task_type": "blocked",
                "follow_up_at": now + timedelta(hours=2),
            },
            {
                "title": "File tax extension",
                "details": "Collect last year documents first, then submit before the deadline turns into a problem.",
                "area": "life",
                "status": "open",
                "task_type": "deadline",
                "due_at": now + timedelta(days=4),
            },
            {
                "title": "Interesting blog on Linux memory reclaim",
                "details": "Worth reading, but it should not compete with current work. Keep it accessible and quiet.",
                "area": "work",
                "status": "open",
                "task_type": "backlog",
            },
            {
                "title": "Book dentist appointment",
                "details": "Captured quickly so it does not disappear. Classify it later if needed.",
                "area": "life",
                "status": "open",
                "task_type": "backlog",
            },
        ]

        for row in seed_rows:
            values = {
                "due_at": None,
                "follow_up_at": None,
                "planned_for": None,
                "parent_id": None,
                "created_at": now,
                "updated_at": now,
                "completed_at": None,
                **row,
            }
            conn.execute(sa.insert(tasks).values(**values))


ensure_tasks_schema()
metadata.create_all(engine)
normalize_task_rows()
seed_initial_tasks()


@app.get("/api/tasks", response_model=List[TaskOut])
def list_tasks():
    with engine.begin() as conn:
        rows = conn.execute(
            sa.select(tasks).order_by(tasks.c.parent_id.is_not(None), tasks.c.updated_at.desc())
        ).all()
    return [row_to_task(row) for row in rows]


@app.post("/api/tasks", response_model=TaskOut)
def create_task(task: TaskCreate):
    now = utcnow()
    values = task.model_dump()
    values["title"] = values["title"].strip()
    if not values["title"]:
        raise HTTPException(status_code=400, detail="Title cannot be empty")

    if values["task_type"] != "deadline":
        values["due_at"] = None
    if values["task_type"] != "blocked":
        values["follow_up_at"] = None
    values["task_type"] = normalize_area_task_type(values["area"], values["task_type"])

    values["created_at"] = now
    values["updated_at"] = now

    if values["status"] == "done" and values["completed_at"] is None:
        values["completed_at"] = now

    with engine.begin() as conn:
        if values["parent_id"] is not None:
            get_task_or_404(conn, values["parent_id"])
        result = conn.execute(sa.insert(tasks).values(**values))
        task_id = result.inserted_primary_key[0]
        created = get_task_or_404(conn, task_id)
    return row_to_task(created)


@app.patch("/api/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, update: TaskUpdate):
    values = update.model_dump(exclude_unset=True)

    if "title" in values:
        values["title"] = values["title"].strip()
        if not values["title"]:
            raise HTTPException(status_code=400, detail="Title cannot be empty")

    if "status" in values:
        if values["status"] == "done" and "completed_at" not in values:
            values["completed_at"] = utcnow()
            values["planned_for"] = None
        elif values["status"] == "open" and "completed_at" not in values:
            values["completed_at"] = None

    values["updated_at"] = utcnow()

    with engine.begin() as conn:
        current = get_task_or_404(conn, task_id)
        current_area = current.area
        current_task_type = current.task_type

        if "parent_id" in values and values["parent_id"] is not None:
            if values["parent_id"] == task_id:
                raise HTTPException(status_code=400, detail="Task cannot parent itself")
            get_task_or_404(conn, values["parent_id"])

        effective_area = values.get("area", current_area)
        effective_task_type = values.get("task_type", current_task_type)
        values["task_type"] = normalize_area_task_type(effective_area, effective_task_type)

        if "task_type" in values and values["task_type"] != "deadline":
            values.setdefault("due_at", None)

        if "task_type" in values and values["task_type"] != "blocked":
            values.setdefault("follow_up_at", None)

        conn.execute(sa.update(tasks).where(tasks.c.id == task_id).values(**values))
        updated = get_task_or_404(conn, task_id)

    return row_to_task(updated)


@app.get("/api/healthz")
def healthz():
    return {"ok": True, "time": utcnow().isoformat()}


dist_dir = pathlib.Path(__file__).parent / "frontend" / "dist"

if dist_dir.exists():
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="frontend")

    @app.exception_handler(404)
    async def spa_fallback(request, exc):
        if request.url.path.startswith("/api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        return FileResponse(dist_dir / "index.html")
