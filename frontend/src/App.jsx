import { useEffect, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "/api";

const NAV_ITEMS = [
  { id: "dashboard", label: "Command Center", description: "Today, due, blocked" },
  { id: "work", label: "Work", description: "Open work tasks" },
  { id: "life", label: "Life", description: "Open life tasks" },
  { id: "blocked", label: "Blocked", description: "Reactive follow-up items" },
  { id: "deadlines", label: "Deadlines", description: "Date-driven commitments" },
  { id: "backlog", label: "Backlog", description: "Captured, not active yet" },
  { id: "all", label: "All Open", description: "Full open inventory" },
];

const CHECKBACK_OPTIONS = [
  { label: "1h", hours: 1 },
  { label: "2h", hours: 2 },
  { label: "6h", hours: 6 },
  { label: "1d", days: 1 },
  { label: "2d", days: 2 },
];

function App() {
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState("dashboard");
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [captureTitle, setCaptureTitle] = useState("");
  const [captureArea, setCaptureArea] = useState("work");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const todayKey = getLocalDateKey(new Date());

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      const target = event.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        document.getElementById("task-search")?.focus();
      }

      if (event.key.toLowerCase() === "n" && !isTyping) {
        event.preventDefault();
        document.getElementById("quick-capture")?.focus();
      }

      if (event.key === "Escape") {
        setSelectedTaskId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function loadTasks() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/tasks`);
      if (!response.ok) {
        throw new Error("Failed to load tasks.");
      }

      const data = await response.json();
      setTasks(data.map(fromApiTask));
    } catch (fetchError) {
      setError(fetchError.message || "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }

  async function createTask(input) {
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`${API}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiTaskPayload(input)),
      });

      if (!response.ok) {
        throw new Error(await getApiError(response, "Failed to create task."));
      }

      const createdTask = fromApiTask(await response.json());
      setTasks((currentTasks) => [createdTask, ...currentTasks]);
      return createdTask;
    } catch (fetchError) {
      setError(fetchError.message || "Failed to create task.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function patchTask(taskId, patch) {
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`${API}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiTaskPayload(patch)),
      });

      if (!response.ok) {
        throw new Error(await getApiError(response, "Failed to update task."));
      }

      const updatedTask = fromApiTask(await response.json());
      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
      );
      return updatedTask;
    } catch (fetchError) {
      setError(fetchError.message || "Failed to update task.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  const rootTasks = tasks.filter((task) => task.parentId === null);
  const openRootTasks = sortTasks(rootTasks.filter((task) => task.status === "open"));
  const backlogTasks = sortTasks(
    rootTasks.filter((task) => task.status === "open" && task.taskType === "backlog"),
  );
  const blockedTasks = sortTasks(
    rootTasks.filter((task) => task.status === "open" && task.taskType === "blocked"),
  );
  const deadlineTasks = sortTasks(
    rootTasks.filter((task) => task.status === "open" && task.taskType === "deadline"),
  );
  const dueSoonTasks = sortTasks(
    deadlineTasks.filter((task) => isOverdue(task.dueAt) || isWithinDays(task.dueAt, 7)),
  );
  const todayTasks = sortTasks(
    rootTasks.filter((task) => task.status === "open" && task.plannedFor === todayKey),
  );
  const workTasks = sortTasks(
    rootTasks.filter((task) => task.area === "work" && task.status === "open"),
  );
  const lifeTasks = sortTasks(
    rootTasks.filter((task) => task.area === "life" && task.status === "open"),
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searchResults = normalizedQuery
    ? sortTasks(rootTasks.filter((task) => matchesTask(task, normalizedQuery)))
    : [];

  async function handleCreateTask(event) {
    event.preventDefault();

    const title = captureTitle.trim();
    if (!title) {
      return;
    }

    const task = await createTask({
      title,
      area: captureArea,
      status: "open",
      taskType: "backlog",
      details: "",
    });

    if (task) {
      setCaptureTitle("");
      setSelectedTaskId(task.id);
      setView("backlog");
      setSearchQuery("");
    }
  }

  async function handleSetTaskStatus(taskId, status) {
    const patch = { status };
    if (status === "done") {
      patch.plannedFor = null;
    }
    await patchTask(taskId, patch);
  }

  async function handleSetTaskType(taskId, taskType) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    const patch = { taskType };
    if (taskType !== "deadline") {
      patch.dueAt = null;
    }
    if (taskType !== "blocked") {
      patch.followUpAt = null;
    }
    await patchTask(taskId, patch);
  }

  async function handleToggleToday(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    await patchTask(taskId, {
      plannedFor: task.plannedFor === todayKey ? null : todayKey,
      status: task.status === "done" ? "open" : task.status,
    });
  }

  const metrics = [
    { label: "Today", value: todayTasks.length, tone: "accent" },
    { label: "Blocked", value: blockedTasks.length, tone: "neutral" },
    { label: "Deadlines", value: dueSoonTasks.length, tone: dueSoonTasks.length > 0 ? "warning" : "neutral" },
    { label: "Backlog", value: backlogTasks.length, tone: "neutral" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Single-player task cockpit</p>
          <h1>External Brain</h1>
          <p className="sidebar-copy">
            Keep the list simple. Decide what is active, what is blocked, what can wait, and what is finished.
          </p>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "nav-item--active" : ""}`}
              onClick={() => {
                setView(item.id);
                setSearchQuery("");
              }}
              type="button"
            >
              <span className="nav-item__copy">
                <span className="nav-item__label">{item.label}</span>
                <span className="nav-item__description">{item.description}</span>
              </span>
              <span className="nav-item__count">
                {getNavCount(item.id, openRootTasks, workTasks, lifeTasks, blockedTasks, deadlineTasks, backlogTasks)}
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p className="eyebrow">Shortcuts</p>
          <p>
            <kbd>N</kbd> quick capture
          </p>
          <p>
            <kbd>/</kbd> search
          </p>
          <p>
            <kbd>Esc</kbd> close detail
          </p>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div className="workspace-header__copy">
            <p className="eyebrow">Overview</p>
            <h2>Simple enough that the system helps instead of adding work.</h2>
          </div>
          <div className="metric-strip" aria-label="Summary">
            {metrics.map((metric) => (
              <div key={metric.label} className={`metric-chip metric-chip--${metric.tone}`}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </header>

        {error ? <div className="status-banner">{error}</div> : null}
        {loading ? <div className="status-banner">Loading tasks...</div> : null}

        <section className="capture-panel">
          <div className="capture-panel__copy">
            <p className="eyebrow">Quick capture</p>
            <p className="capture-panel__hint">New tasks land in backlog so you can decide later.</p>
          </div>

          <form className="capture-form" onSubmit={handleCreateTask}>
            <input
              id="quick-capture"
              autoComplete="off"
              className="capture-input"
              onChange={(event) => setCaptureTitle(event.target.value)}
              placeholder="Add a task you do not want to hold in your head"
              value={captureTitle}
            />

            <div className="capture-form__controls">
              <label className="field-inline">
                <span>Area</span>
                <select value={captureArea} onChange={(event) => setCaptureArea(event.target.value)}>
                  <option value="work">Work</option>
                  <option value="life">Life</option>
                </select>
              </label>

              <button className="primary-button" disabled={isSaving} type="submit">
                Create
              </button>
            </div>
          </form>
        </section>

        <section className="search-row">
          <label className="search-input" htmlFor="task-search">
            <span>Search</span>
            <input
              id="task-search"
              autoComplete="off"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search titles and details"
              value={searchQuery}
            />
          </label>
        </section>

        {normalizedQuery ? (
          <TaskCollection
            description={`Results for "${searchQuery.trim()}"`}
            emptyState="No task matches that search."
            onSelect={setSelectedTaskId}
            onSetStatus={handleSetTaskStatus}
            onSetTaskType={handleSetTaskType}
            onToggleToday={handleToggleToday}
            selectedTaskId={selectedTaskId}
            tasks={searchResults}
            title="Search"
            todayKey={todayKey}
          />
        ) : view === "dashboard" ? (
          <div className="dashboard-grid">
            <TaskCollection
              description="The few tasks you have deliberately pulled into today."
              emptyState="Nothing selected for today yet."
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onSetTaskType={handleSetTaskType}
              onToggleToday={handleToggleToday}
              selectedTaskId={selectedTaskId}
              tasks={todayTasks}
              title="Today"
              todayKey={todayKey}
            />

            <TaskCollection
              description="Deadlines that can become expensive if ignored."
              emptyState="No deadlines in the danger window."
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onSetTaskType={handleSetTaskType}
              onToggleToday={handleToggleToday}
              selectedTaskId={selectedTaskId}
              tasks={dueSoonTasks}
              title="Due Soon"
              todayKey={todayKey}
            />

            <TaskCollection
              description="Tasks blocked on time, CI, or someone else."
              emptyState="No blocked items right now."
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onSetTaskType={handleSetTaskType}
              onToggleToday={handleToggleToday}
              selectedTaskId={selectedTaskId}
              tasks={blockedTasks}
              title="Blocked"
              todayKey={todayKey}
            />

            <TaskCollection
              description="Things worth keeping without making them active."
              emptyState="Backlog is empty."
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onSetTaskType={handleSetTaskType}
              onToggleToday={handleToggleToday}
              selectedTaskId={selectedTaskId}
              tasks={backlogTasks}
              title="Backlog"
              todayKey={todayKey}
            />
          </div>
        ) : (
          <TaskCollection
            description={getViewDescription(view)}
            emptyState={getViewEmptyState(view)}
            onSelect={setSelectedTaskId}
            onSetStatus={handleSetTaskStatus}
            onSetTaskType={handleSetTaskType}
            onToggleToday={handleToggleToday}
            selectedTaskId={selectedTaskId}
            tasks={getViewTasks(view, openRootTasks, workTasks, lifeTasks, blockedTasks, deadlineTasks, backlogTasks)}
            title={getViewTitle(view)}
            todayKey={todayKey}
          />
        )}
      </main>

      <aside className="inspector-shell">
        {selectedTask ? (
          <TaskInspector
            key={selectedTask.id}
            onClose={() => setSelectedTaskId(null)}
            onSetStatus={handleSetTaskStatus}
            onSetTaskType={handleSetTaskType}
            onToggleToday={handleToggleToday}
            onUpdateTask={patchTask}
            task={selectedTask}
            todayKey={todayKey}
          />
        ) : (
          <div className="empty-inspector">
            <p className="eyebrow">Detail</p>
            <h3>Select a task</h3>
            <p>Use the center panels to edit details, dates, type, and status.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function TaskCollection({
  title,
  description,
  emptyState,
  tasks,
  todayKey,
  selectedTaskId,
  onSelect,
  onToggleToday,
  onSetTaskType,
  onSetStatus,
}) {
  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <p className="eyebrow">{title}</p>
          <h3>{description}</h3>
        </div>
        <span className="panel__count">{tasks.length}</span>
      </header>

      {tasks.length > 0 ? (
        <div className="panel__body">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              isSelected={selectedTaskId === task.id}
              onSelect={() => onSelect(task.id)}
              onSetStatus={(status) => onSetStatus(task.id, status)}
              onSetTaskType={(taskType) => onSetTaskType(task.id, taskType)}
              onToggleToday={() => onToggleToday(task.id)}
              task={task}
              todayKey={todayKey}
            />
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <p>{emptyState}</p>
        </div>
      )}
    </section>
  );
}

function TaskCard({ task, isSelected, todayKey, onSelect, onToggleToday, onSetTaskType, onSetStatus }) {
  const statusTone = getTimingTone(task);

  return (
    <article className={`task-card ${isSelected ? "task-card--selected" : ""}`} onClick={onSelect}>
      <div className="task-card__topline">
        <div className="task-card__badges">
          <span className={`badge badge--${task.area}`}>{task.area}</span>
          <span className="badge badge--soft">{formatTaskType(task.taskType)}</span>
          {task.plannedFor === todayKey ? <span className="badge">today</span> : null}
        </div>
        <button
          className="ghost-button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          type="button"
        >
          Open
        </button>
      </div>

      <h4>{task.title}</h4>
      <p className="task-card__preview">{task.details ? task.details : "No details yet."}</p>

      <div className="task-card__meta">
        {task.dueAt ? (
          <span className={`task-card__meta-pill task-card__meta-pill--${statusTone}`}>
            Due {formatDueDate(task.dueAt)}
          </span>
        ) : null}
        {task.followUpAt ? (
          <span className="task-card__meta-pill">Check {formatRelativeMoment(task.followUpAt)}</span>
        ) : null}
      </div>

      <div className="task-card__actions">
        <button
          className={`mini-button ${task.plannedFor === todayKey ? "mini-button--active" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleToday();
          }}
          type="button"
        >
          {task.plannedFor === todayKey ? "Unplan" : "Today"}
        </button>
        <button
          className={`mini-button ${task.taskType === "main" ? "mini-button--active" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onSetTaskType("main");
          }}
          type="button"
        >
          Main
        </button>
        <button
          className={`mini-button ${task.taskType === "blocked" ? "mini-button--active" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onSetTaskType("blocked");
          }}
          type="button"
        >
          Blocked
        </button>
        <button
          className={`mini-button ${task.taskType === "deadline" ? "mini-button--active" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onSetTaskType("deadline");
          }}
          type="button"
        >
          Deadline
        </button>
        <button
          className={`mini-button ${task.taskType === "backlog" ? "mini-button--active" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onSetTaskType("backlog");
          }}
          type="button"
        >
          Backlog
        </button>
        <button
          className="mini-button"
          onClick={(event) => {
            event.stopPropagation();
            onSetStatus(task.status === "done" ? "open" : "done");
          }}
          type="button"
        >
          {task.status === "done" ? "Reopen" : "Done"}
        </button>
      </div>
    </article>
  );
}

function TaskInspector({ task, todayKey, onClose, onUpdateTask, onToggleToday, onSetStatus, onSetTaskType }) {
  const [draft, setDraft] = useState(createDraft(task));

  useEffect(() => {
    setDraft(createDraft(task));
  }, [task]);

  async function saveField(fieldName, value) {
    await onUpdateTask(task.id, { [fieldName]: value });
  }

  return (
    <div className="inspector">
      <div className="inspector__header">
        <div>
          <p className="eyebrow">Task detail</p>
          <h3>{task.title}</h3>
        </div>
        <button className="ghost-button" onClick={onClose} type="button">
          Close
        </button>
      </div>

      <div className="field-group">
        <label className="field">
          <span>Title</span>
          <input
            onBlur={() => saveField("title", draft.title.trim() || task.title)}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            value={draft.title}
          />
        </label>
      </div>

      <div className="field-grid">
        <div className="field-group">
          <span className="field-group__label">Area</span>
          <div className="segmented-control">
            {["work", "life"].map((area) => (
              <button
                key={area}
                className={`segmented-control__button ${task.area === area ? "segmented-control__button--active" : ""}`}
                onClick={() => saveField("area", area)}
                type="button"
              >
                {area}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <span className="field-group__label">Status</span>
          <div className="segmented-control">
            {["open", "done"].map((status) => (
              <button
                key={status}
                className={`segmented-control__button ${task.status === status ? "segmented-control__button--active" : ""}`}
                onClick={() => onSetStatus(task.id, status)}
                type="button"
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="field-group">
        <span className="field-group__label">Type</span>
        <div className="segmented-control segmented-control--four-up">
          {["main", "blocked", "deadline", "backlog"].map((taskType) => (
            <button
              key={taskType}
              className={`segmented-control__button ${task.taskType === taskType ? "segmented-control__button--active" : ""}`}
              onClick={() => onSetTaskType(task.id, taskType)}
              type="button"
            >
              {formatTaskType(taskType)}
            </button>
          ))}
        </div>
      </div>

      {task.taskType === "deadline" ? (
        <div className="field-group">
          <label className="field">
            <span>Due date</span>
            <input
              onBlur={() => saveField("dueAt", localDateToIso(draft.dueDate))}
              onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
              type="date"
              value={draft.dueDate}
            />
          </label>
        </div>
      ) : null}

      {task.taskType === "blocked" ? (
        <div className="field-group">
          <span className="field-group__label">Check back</span>
          <div className="segmented-control segmented-control--five-up">
            {CHECKBACK_OPTIONS.map((option) => (
              <button
                key={option.label}
                className="segmented-control__button"
                onClick={() => saveField("followUpAt", createFollowUpIso(option))}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {task.followUpAt ? (
            <p className="field-help">
              Current check back: {formatRelativeMoment(task.followUpAt)}
            </p>
          ) : null}
          {task.followUpAt ? (
            <button
              className="ghost-button ghost-button--inline"
              onClick={() => saveField("followUpAt", null)}
              type="button"
            >
              Clear check back
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="field-group">
        <button
          className={`secondary-button ${task.plannedFor === todayKey ? "secondary-button--active" : ""}`}
          onClick={() => onToggleToday(task.id)}
          type="button"
        >
          {task.plannedFor === todayKey ? "Remove from Today" : "Pull into Today"}
        </button>
      </div>

      <div className="field-group">
        <label className="field">
          <span>Details</span>
          <textarea
            onBlur={() => saveField("details", draft.details)}
            onChange={(event) => setDraft((current) => ({ ...current, details: event.target.value }))}
            placeholder="Keep all context here."
            rows={7}
            value={draft.details}
          />
        </label>
      </div>
    </div>
  );
}

function createDraft(task) {
  return {
    title: task.title,
    details: task.details,
    dueDate: isoToDateInput(task.dueAt),
  };
}

function fromApiTask(task) {
  return {
    id: task.id,
    title: task.title,
    details: task.details || "",
    area: task.area,
    status: task.status,
    taskType: task.task_type,
    dueAt: task.due_at,
    followUpAt: task.follow_up_at,
    plannedFor: task.planned_for,
    parentId: task.parent_id,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
  };
}

function toApiTaskPayload(task) {
  const payload = {};
  if ("title" in task) payload.title = task.title;
  if ("details" in task) payload.details = task.details;
  if ("area" in task) payload.area = task.area;
  if ("status" in task) payload.status = task.status;
  if ("taskType" in task) payload.task_type = task.taskType;
  if ("dueAt" in task) payload.due_at = task.dueAt;
  if ("followUpAt" in task) payload.follow_up_at = task.followUpAt;
  if ("plannedFor" in task) payload.planned_for = task.plannedFor;
  if ("parentId" in task) payload.parent_id = task.parentId;
  if ("completedAt" in task) payload.completed_at = task.completedAt;
  return payload;
}

function getNavCount(viewId, openRootTasks, workTasks, lifeTasks, blockedTasks, deadlineTasks, backlogTasks) {
  switch (viewId) {
    case "dashboard":
      return openRootTasks.length;
    case "work":
      return workTasks.length;
    case "life":
      return lifeTasks.length;
    case "blocked":
      return blockedTasks.length;
    case "deadlines":
      return deadlineTasks.length;
    case "backlog":
      return backlogTasks.length;
    case "all":
      return openRootTasks.length;
    default:
      return 0;
  }
}

function getViewTitle(viewId) {
  switch (viewId) {
    case "dashboard":
      return "Command Center";
    case "work":
      return "Work";
    case "life":
      return "Life";
    case "blocked":
      return "Blocked";
    case "deadlines":
      return "Deadlines";
    case "backlog":
      return "Backlog";
    case "all":
      return "All Open";
    default:
      return "Tasks";
  }
}

function getViewDescription(viewId) {
  switch (viewId) {
    case "dashboard":
      return "Your high-signal command center.";
    case "work":
      return "Open work tasks across main, blocked, backlog, and deadlines.";
    case "life":
      return "Open life tasks that should not disappear.";
    case "blocked":
      return "Tasks blocked on time, CI, or someone else.";
    case "deadlines":
      return "Tasks with a real due date.";
    case "backlog":
      return "Tasks worth keeping without making them active.";
    case "all":
      return "Every open top-level task in one place.";
    default:
      return "";
  }
}

function getViewEmptyState(viewId) {
  switch (viewId) {
    case "dashboard":
      return "Nothing to show.";
    case "work":
      return "No open work tasks.";
    case "life":
      return "No open life tasks.";
    case "blocked":
      return "No blocked tasks.";
    case "deadlines":
      return "No deadlines on the board.";
    case "backlog":
      return "No backlog tasks.";
    case "all":
      return "No open tasks.";
    default:
      return "Nothing here.";
  }
}

function getViewTasks(viewId, openRootTasks, workTasks, lifeTasks, blockedTasks, deadlineTasks, backlogTasks) {
  switch (viewId) {
    case "dashboard":
      return openRootTasks;
    case "work":
      return workTasks;
    case "life":
      return lifeTasks;
    case "blocked":
      return blockedTasks;
    case "deadlines":
      return deadlineTasks;
    case "backlog":
      return backlogTasks;
    case "all":
      return openRootTasks;
    default:
      return openRootTasks;
  }
}

function formatTaskType(taskType) {
  switch (taskType) {
    case "main":
      return "Main";
    case "blocked":
      return "Blocked";
    case "deadline":
      return "Deadline";
    case "backlog":
      return "Backlog";
    default:
      return taskType;
  }
}

function formatDueDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function isoToDateInput(value) {
  if (!value) {
    return "";
  }

  return getLocalDateKey(new Date(value));
}

function localDateToIso(value) {
  if (!value) {
    return null;
  }
  return new Date(`${value}T00:00:00`).toISOString();
}

function createFollowUpIso(option) {
  const totalHours = option.days ? option.days * 24 : option.hours;
  return new Date(Date.now() + totalHours * 60 * 60 * 1000).toISOString();
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatRelativeMoment(value) {
  const deltaMinutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000);
  if (Math.abs(deltaMinutes) < 60) {
    return `${Math.abs(deltaMinutes)}m ${deltaMinutes >= 0 ? "from now" : "ago"}`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return `${Math.abs(deltaHours)}h ${deltaHours >= 0 ? "from now" : "ago"}`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  return `${Math.abs(deltaDays)}d ${deltaDays >= 0 ? "from now" : "ago"}`;
}

function isWithinDays(value, days) {
  if (!value) {
    return false;
  }
  const delta = new Date(value).getTime() - Date.now();
  return delta <= days * 24 * 60 * 60 * 1000;
}

function isOverdue(value) {
  if (!value) {
    return false;
  }
  return new Date(value).getTime() < Date.now();
}

function getTimingTone(task) {
  if (isOverdue(task.dueAt)) {
    return "warning";
  }
  if (task.dueAt && isWithinDays(task.dueAt, 2)) {
    return "accent";
  }
  return "neutral";
}

function sortTasks(tasks) {
  return [...tasks].sort((left, right) => {
    const leftPlanned = left.plannedFor ? 0 : 1;
    const rightPlanned = right.plannedFor ? 0 : 1;
    if (leftPlanned !== rightPlanned) {
      return leftPlanned - rightPlanned;
    }

    const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }

    const leftFollowUp = left.followUpAt ? new Date(left.followUpAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightFollowUp = right.followUpAt ? new Date(right.followUpAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (leftFollowUp !== rightFollowUp) {
      return leftFollowUp - rightFollowUp;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function matchesTask(task, query) {
  const haystack = [task.title, task.details, task.area, task.status, task.taskType]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

async function getApiError(response, fallbackMessage) {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string" && data.detail) {
      return data.detail;
    }
    if (Array.isArray(data?.detail) && data.detail.length > 0) {
      return data.detail
        .map((item) => `${item.loc?.join(".") || "request"}: ${item.msg}`)
        .join("; ");
    }
  } catch {
    // ignore parse errors and use fallback
  }

  return fallbackMessage;
}

export default App;
