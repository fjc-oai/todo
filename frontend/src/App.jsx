import { useEffect, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "/api";

const PRIMARY_TABS = [
  {
    id: "today",
    label: "Today",
  },
  {
    id: "all",
    label: "All Tasks",
  },
];

const AREA_TABS = [
  { id: "work", label: "Work" },
  { id: "life", label: "Life" },
];

const TYPE_TABS = [
  { id: "main", label: "Main" },
  { id: "blocked", label: "Blocked" },
  { id: "deadline", label: "Deadline" },
  { id: "backlog", label: "Backlog" },
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
  const [primaryTab, setPrimaryTab] = useState("today");
  const [areaTab, setAreaTab] = useState("work");
  const [typeTab, setTypeTab] = useState("main");
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [captureTitle, setCaptureTitle] = useState("");
  const [captureArea, setCaptureArea] = useState("work");
  const [captureTaskType, setCaptureTaskType] = useState("main");
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
  const selectedTaskSubtasks = selectedTask
    ? sortTasks(tasks.filter((task) => task.parentId === selectedTask.id))
    : [];
  const selectedTaskParent = selectedTask?.parentId
    ? tasks.find((task) => task.id === selectedTask.parentId) ?? null
    : null;

  const rootTasks = sortTasks(tasks.filter((task) => task.parentId === null));
  const childrenByParentId = buildChildrenByParentId(tasks);
  const openChildrenByParentId = buildChildrenByParentId(tasks.filter((task) => task.status === "open"));
  const openChildCountByParentId = buildOpenChildCountByParentId(tasks);
  const openTasks = sortTasks(tasks.filter((task) => task.status === "open"));
  const doneTasks = sortCompletedTasks(tasks.filter((task) => task.status === "done"));
  const backlogTasks = sortTasks(
    openTasks.filter((task) => task.taskType === "backlog"),
  );
  const mainTasks = sortTasks(
    openTasks.filter((task) => task.taskType === "main"),
  );
  const blockedTasks = sortTasks(
    openTasks.filter((task) => task.taskType === "blocked"),
  );
  const deadlineTasks = sortTasks(
    openTasks.filter((task) => task.taskType === "deadline"),
  );
  const todayWorkTasks = sortTasks(
    openTasks.filter(
      (task) =>
        task.plannedFor === todayKey &&
        task.area === "work" &&
        task.taskType !== "blocked" &&
        task.taskType !== "deadline",
    ),
  );
  const todayLifeTasks = sortTasks(
    openTasks.filter(
      (task) =>
        task.plannedFor === todayKey &&
        task.area === "life" &&
        task.taskType !== "blocked" &&
        task.taskType !== "deadline",
    ),
  );
  const blockedTodayTasks = sortTasks(
    blockedTasks.filter(
      (task) => !task.followUpAt || isOnOrBefore(task.followUpAt, getEndOfLocalDay(new Date())),
    ),
  );
  const deadlineTodayTasks = sortTasks(
    deadlineTasks.filter((task) => task.dueAt && isOnOrBefore(task.dueAt, getEndOfLocalDay(new Date()))),
  );
  const todayWorkSections = [
    createTaskSection("main", "Main", todayWorkTasks.filter((task) => task.taskType === "main"), rootTasks, openChildrenByParentId),
    createTaskSection("blocked", "Blocked", blockedTodayTasks.filter((task) => task.area === "work"), rootTasks, openChildrenByParentId),
    createTaskSection("deadline", "Deadline", deadlineTodayTasks.filter((task) => task.area === "work"), rootTasks, openChildrenByParentId),
    createTaskSection("backlog", "Backlog", todayWorkTasks.filter((task) => task.taskType === "backlog"), rootTasks, openChildrenByParentId),
  ];
  const todayLifeSections = [
    createTaskSection("blocked", "Blocked", blockedTodayTasks.filter((task) => task.area === "life"), rootTasks, openChildrenByParentId),
    createTaskSection("deadline", "Deadline", deadlineTodayTasks.filter((task) => task.area === "life"), rootTasks, openChildrenByParentId),
    createTaskSection("backlog", "Backlog", todayLifeTasks.filter((task) => task.taskType === "backlog"), rootTasks, openChildrenByParentId),
  ];
  const workTasks = sortTasks(
    openTasks.filter((task) => task.area === "work"),
  );
  const lifeTasks = sortTasks(
    openTasks.filter((task) => task.area === "life"),
  );
  const workSections = [
    createTaskSection("main", "Main", workTasks.filter((task) => task.taskType === "main"), rootTasks, openChildrenByParentId),
    createTaskSection("blocked", "Blocked", workTasks.filter((task) => task.taskType === "blocked"), rootTasks, openChildrenByParentId),
    createTaskSection("deadline", "Deadline", workTasks.filter((task) => task.taskType === "deadline"), rootTasks, openChildrenByParentId),
    createTaskSection("backlog", "Backlog", workTasks.filter((task) => task.taskType === "backlog"), rootTasks, openChildrenByParentId),
  ];
  const lifeSections = [
    createTaskSection("blocked", "Blocked", lifeTasks.filter((task) => task.taskType === "blocked"), rootTasks, openChildrenByParentId),
    createTaskSection("deadline", "Deadline", lifeTasks.filter((task) => task.taskType === "deadline"), rootTasks, openChildrenByParentId),
    createTaskSection("backlog", "Backlog", lifeTasks.filter((task) => task.taskType === "backlog"), rootTasks, openChildrenByParentId),
  ];
  const doneTaskGroups = sortTaskGroupsByCompletedAt(
    buildTaskGroups(rootTasks, childrenByParentId, doneTasks, { includeAllChildrenForMatchingRoot: false }),
  );
  const workTaskGroups = buildTaskGroups(rootTasks, openChildrenByParentId, workTasks);
  const lifeTaskGroups = buildTaskGroups(rootTasks, openChildrenByParentId, lifeTasks);
  const mainTaskGroups = buildTaskGroups(rootTasks, openChildrenByParentId, mainTasks);
  const blockedTaskGroups = buildTaskGroups(rootTasks, openChildrenByParentId, blockedTasks);
  const deadlineTaskGroups = buildTaskGroups(rootTasks, openChildrenByParentId, deadlineTasks);
  const backlogTaskGroups = buildTaskGroups(rootTasks, openChildrenByParentId, backlogTasks);
  const todayCount =
    todayWorkTasks.length +
    todayLifeTasks.length +
    blockedTodayTasks.length +
    deadlineTodayTasks.length;

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
      taskType: captureTaskType,
      details: "",
    });

    if (task) {
      setCaptureTitle("");
      setCaptureTaskType(captureArea === "work" ? "main" : "backlog");
      setSelectedTaskId(task.id);
      setPrimaryTab("all");
    }
  }

  async function handleSetTaskStatus(taskId, status) {
    if (status === "done" && getOpenChildCount(taskId, openChildCountByParentId) > 0) {
      setError("Finish all open subtasks before marking the parent task done.");
      return;
    }

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

    if (task.area === "life" && taskType === "main") {
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

  async function handleCreateSubtask(parentTaskId, title) {
    const parentTask = tasks.find((task) => task.id === parentTaskId);
    if (!parentTask) {
      return null;
    }

    const createdTask = await createTask({
      title,
      area: parentTask.area,
      status: "open",
      taskType: "backlog",
      details: "",
      parentId: parentTaskId,
    });

    return createdTask;
  }

  const metrics = [
    {
      label: "Selected",
      value: todayWorkTasks.length + todayLifeTasks.length,
      tone: "accent",
    },
    {
      label: "Blocked Today",
      value: blockedTodayTasks.length,
      tone: "neutral",
    },
    {
      label: "Due Today",
      value: deadlineTodayTasks.length,
      tone: deadlineTodayTasks.length > 0 ? "warning" : "neutral",
    },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <h1>External Brain</h1>
          <p className="sidebar-copy">
            Decide today, and let the system carry the rest of the mental load.
          </p>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {PRIMARY_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`nav-item ${primaryTab === tab.id ? "nav-item--active" : ""}`}
              onClick={() => {
                setPrimaryTab(tab.id);
              }}
              type="button"
            >
              <span className="nav-item__copy">
                <span className="nav-item__label">{tab.label}</span>
              </span>
              <span className="nav-item__count">
                {getPrimaryTabCount(tab.id, todayCount, openTasks.length, doneTasks.length)}
              </span>
            </button>
          ))}

          <div className="nav-group">
            <div className="nav-section-row" aria-hidden="true">
              <span className="nav-item__label">Areas</span>
            </div>
            <div className="nav-subtabs" aria-label="Area views">
              {AREA_TABS.map((subtab) => (
                <button
                  key={subtab.id}
                  className={`nav-subitem ${primaryTab === "areas" && areaTab === subtab.id ? "nav-subitem--active" : ""}`}
                  onClick={() => {
                    setPrimaryTab("areas");
                    setAreaTab(subtab.id);
                  }}
                  type="button"
                >
                  <span className="nav-item__copy">
                    <span className="nav-item__label">{subtab.label}</span>
                  </span>
                  <span className="nav-item__count">{subtab.id === "work" ? workTasks.length : lifeTasks.length}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="nav-group">
            <div className="nav-section-row" aria-hidden="true">
              <span className="nav-item__label">Types</span>
            </div>
            <div className="nav-subtabs" aria-label="Type views">
              {TYPE_TABS.map((subtab) => (
                <button
                  key={subtab.id}
                  className={`nav-subitem ${primaryTab === "types" && typeTab === subtab.id ? "nav-subitem--active" : ""}`}
                  onClick={() => {
                    setPrimaryTab("types");
                    setTypeTab(subtab.id);
                  }}
                  type="button"
                >
                  <span className="nav-item__copy">
                    <span className="nav-item__label">{subtab.label}</span>
                  </span>
                  <span className="nav-item__count">
                    {getTypeCount(subtab.id, mainTasks, blockedTasks, deadlineTasks, backlogTasks)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            className={`nav-item ${primaryTab === "done" ? "nav-item--active" : ""}`}
            onClick={() => {
              setPrimaryTab("done");
            }}
            type="button"
          >
            <span className="nav-item__copy">
              <span className="nav-item__label">Done</span>
            </span>
            <span className="nav-item__count">{doneTasks.length}</span>
          </button>
        </nav>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <h3 className="workspace-header__title">Overview</h3>
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
          <form className="capture-form capture-form--compact" onSubmit={handleCreateTask}>
            <input
              id="quick-capture"
              autoComplete="off"
              className="capture-input"
              onChange={(event) => setCaptureTitle(event.target.value)}
              placeholder="Add a task you do not want to hold in your head"
              value={captureTitle}
            />

            <select
              value={captureArea}
              onChange={(event) => {
                const nextArea = event.target.value;
                setCaptureArea(nextArea);
                setCaptureTaskType((current) => {
                  const availableTaskTypes = getAvailableTaskTypes(nextArea);
                  return availableTaskTypes.includes(current) ? current : availableTaskTypes[0];
                });
              }}
            >
              <option value="work">Work</option>
              <option value="life">Life</option>
            </select>

            <select value={captureTaskType} onChange={(event) => setCaptureTaskType(event.target.value)}>
              {getAvailableTaskTypes(captureArea).map((taskType) => (
                <option key={taskType} value={taskType}>
                  {formatTaskType(taskType)}
                </option>
              ))}
            </select>

            <button className="primary-button" disabled={isSaving} type="submit">
              Create
            </button>
          </form>
        </section>

        {primaryTab === "today" ? (
          <div className="today-stack">
            <AreaSectionPanel
              emptyState="No work tasks need attention today."
              getOpenChildCount={(taskId) => getOpenChildCount(taskId, openChildCountByParentId)}
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onSetTaskType={handleSetTaskType}
              onToggleToday={handleToggleToday}
              selectedTaskId={selectedTaskId}
              sections={todayWorkSections}
              title="Work"
              todayKey={todayKey}
            />

            <AreaSectionPanel
              emptyState="No life tasks need attention today."
              getOpenChildCount={(taskId) => getOpenChildCount(taskId, openChildCountByParentId)}
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onSetTaskType={handleSetTaskType}
              onToggleToday={handleToggleToday}
              selectedTaskId={selectedTaskId}
              sections={todayLifeSections}
              title="Life"
              todayKey={todayKey}
            />
          </div>
        ) : primaryTab === "all" ? (
          <div className="today-stack">
            <AreaSectionPanel
              emptyState="No open work tasks."
              getOpenChildCount={(taskId) => getOpenChildCount(taskId, openChildCountByParentId)}
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onSetTaskType={handleSetTaskType}
              onToggleToday={handleToggleToday}
              selectedTaskId={selectedTaskId}
              sections={workSections}
              title="Work"
              todayKey={todayKey}
            />

            <AreaSectionPanel
              emptyState="No open life tasks."
              getOpenChildCount={(taskId) => getOpenChildCount(taskId, openChildCountByParentId)}
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onSetTaskType={handleSetTaskType}
              onToggleToday={handleToggleToday}
              selectedTaskId={selectedTaskId}
              sections={lifeSections}
              title="Life"
              todayKey={todayKey}
            />
          </div>
        ) : primaryTab === "done" ? (
          <TaskCollection
            emptyState="No finished tasks yet."
            getOpenChildCount={(taskId) => getOpenChildCount(taskId, openChildCountByParentId)}
            onSelect={setSelectedTaskId}
            onSetStatus={handleSetTaskStatus}
            onSetTaskType={handleSetTaskType}
            onToggleToday={handleToggleToday}
            count={doneTasks.length}
            groups={doneTaskGroups}
            selectedTaskId={selectedTaskId}
            title="Done"
            todayKey={todayKey}
          />
        ) : primaryTab === "areas" ? (
          <TaskCollection
            emptyState={getAreaEmptyState(areaTab)}
            getOpenChildCount={(taskId) => getOpenChildCount(taskId, openChildCountByParentId)}
            onSelect={setSelectedTaskId}
            onSetStatus={handleSetTaskStatus}
            onSetTaskType={handleSetTaskType}
            onToggleToday={handleToggleToday}
            count={areaTab === "work" ? workTasks.length : lifeTasks.length}
            groups={areaTab === "work" ? workTaskGroups : lifeTaskGroups}
            selectedTaskId={selectedTaskId}
            title={areaTab === "work" ? "Work" : "Life"}
            todayKey={todayKey}
          />
        ) : (
          <TaskCollection
            emptyState={getTypeEmptyState(typeTab)}
            getOpenChildCount={(taskId) => getOpenChildCount(taskId, openChildCountByParentId)}
            onSelect={setSelectedTaskId}
            onSetStatus={handleSetTaskStatus}
            onSetTaskType={handleSetTaskType}
            onToggleToday={handleToggleToday}
            count={getTypeTasks(typeTab, mainTasks, blockedTasks, deadlineTasks, backlogTasks).length}
            groups={getTypeTaskGroups(
              typeTab,
              mainTaskGroups,
              blockedTaskGroups,
              deadlineTaskGroups,
              backlogTaskGroups,
            )}
            selectedTaskId={selectedTaskId}
            title={formatTaskType(typeTab)}
            todayKey={todayKey}
          />
        )}
      </main>

      <aside className="inspector-shell">
        {selectedTask ? (
          <TaskInspector
            key={selectedTask.id}
            onCreateSubtask={handleCreateSubtask}
            onClose={() => setSelectedTaskId(null)}
            openSubtaskCount={getOpenChildCount(selectedTask.id, openChildCountByParentId)}
            onSetStatus={handleSetTaskStatus}
            onSetTaskType={handleSetTaskType}
            onToggleToday={handleToggleToday}
            onUpdateTask={patchTask}
            onSelectTask={setSelectedTaskId}
            parentTask={selectedTaskParent}
            subtasks={selectedTaskSubtasks}
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
  emptyState,
  count,
  groups,
  getOpenChildCount,
  todayKey,
  selectedTaskId,
  onSelect,
  onToggleToday,
  onSetStatus,
}) {
  return (
    <section className="panel">
      <header className="panel__header">
        <h3>{title}</h3>
        <span className="panel__count">{count}</span>
      </header>

      {count > 0 ? (
        <div className="panel__body">
          {groups.map((group) => (
            <TaskTree
              getOpenChildCount={getOpenChildCount}
              group={group}
              key={group.root.id}
              onSelect={onSelect}
              onSetStatus={onSetStatus}
              onToggleToday={onToggleToday}
              selectedTaskId={selectedTaskId}
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

function AreaSectionPanel({
  title,
  sections,
  emptyState,
  getOpenChildCount,
  todayKey,
  selectedTaskId,
  onSelect,
  onToggleToday,
  onSetStatus,
}) {
  const visibleSections = sections.filter((section) => section.count > 0);
  const taskCount = sections.reduce((count, section) => count + section.count, 0);

  return (
    <section className="panel">
      <header className="panel__header">
        <h3>{title}</h3>
        <span className="panel__count">{taskCount}</span>
      </header>

      {visibleSections.length > 0 ? (
        <div className="today-area-panel__sections">
          {visibleSections.map((section) => (
            <section className="today-area-panel__section" key={section.id}>
              <div className="today-area-panel__section-header">
                <h4>{section.title}</h4>
                <span className="today-area-panel__section-count">{section.count}</span>
              </div>
              <div className="panel__body">
                {section.groups.map((group) => (
                  <TaskTree
                    getOpenChildCount={getOpenChildCount}
                    group={group}
                    key={group.root.id}
                    onSelect={onSelect}
                    onSetStatus={onSetStatus}
                    onToggleToday={onToggleToday}
                    selectedTaskId={selectedTaskId}
                    todayKey={todayKey}
                  />
                ))}
              </div>
            </section>
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

function TaskTree({ group, getOpenChildCount, selectedTaskId, todayKey, onSelect, onToggleToday, onSetStatus }) {
  return (
    <div className="task-tree">
      <TaskCard
        isSelected={selectedTaskId === group.root.id}
        openSubtaskCount={getOpenChildCount(group.root.id)}
        onSelect={() => onSelect(group.root.id)}
        onSetStatus={(status) => onSetStatus(group.root.id, status)}
        onToggleToday={() => onToggleToday(group.root.id)}
        task={group.root}
        todayKey={todayKey}
      />

      {group.children.length > 0 ? (
        <div className="task-tree__children">
          {group.children.map((child) => (
            <TaskCard
              isSelected={selectedTaskId === child.id}
              isSubtask
              key={child.id}
              openSubtaskCount={0}
              onSelect={() => onSelect(child.id)}
              onSetStatus={(status) => onSetStatus(child.id, status)}
              onToggleToday={() => onToggleToday(child.id)}
              task={child}
              todayKey={todayKey}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TaskCard({
  task,
  isSelected,
  isSubtask = false,
  openSubtaskCount = 0,
  todayKey,
  onSelect,
  onToggleToday,
  onSetStatus,
}) {
  const statusTone = getTimingTone(task);
  const isPlannedToday = task.plannedFor === todayKey;
  const doneDisabled = task.status !== "done" && openSubtaskCount > 0;

  return (
    <article
      className={`task-card ${isSelected ? "task-card--selected" : ""} ${isSubtask ? "task-card--subtask" : ""}`}
      onClick={onSelect}
    >
      <div className="task-card__topline">
        <h4>{task.title}</h4>
        <div className="task-card__topline-actions">
          <button
            className="ghost-button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleToday();
            }}
            type="button"
          >
            {isPlannedToday ? "Defer" : "Today"}
          </button>
          <button
            className="ghost-button"
            disabled={doneDisabled}
            onClick={(event) => {
              event.stopPropagation();
              onSetStatus(task.status === "done" ? "open" : "done");
            }}
            title={doneDisabled ? "Finish all open subtasks first" : undefined}
            type="button"
          >
            {task.status === "done" ? "Reopen" : "Close"}
          </button>
        </div>
      </div>

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
    </article>
  );
}

function TaskInspector({
  task,
  parentTask,
  subtasks,
  openSubtaskCount,
  todayKey,
  onClose,
  onCreateSubtask,
  onUpdateTask,
  onToggleToday,
  onSetStatus,
  onSetTaskType,
  onSelectTask,
}) {
  const [draft, setDraft] = useState(createDraft(task));
  const [subtaskTitle, setSubtaskTitle] = useState("");

  useEffect(() => {
    setDraft(createDraft(task));
  }, [task]);

  async function saveField(fieldName, value) {
    await onUpdateTask(task.id, { [fieldName]: value });
  }

  const availableTaskTypes = getAvailableTaskTypes(task.area);
  const isSubtask = task.parentId !== null;

  async function handleCreateSubtask(event) {
    event.preventDefault();
    const title = subtaskTitle.trim();
    if (!title) {
      return;
    }

    const created = await onCreateSubtask(task.id, title);
    if (created) {
      setSubtaskTitle("");
    }
  }

  return (
    <div className="inspector">
      <div className="inspector__header">
        <div>
          <p className="eyebrow">Task detail</p>
          <h3>{task.title}</h3>
          {parentTask ? <p className="inspector__context">Subtask of {parentTask.title}</p> : null}
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
                disabled={isSubtask}
              >
                {area}
              </button>
            ))}
          </div>
          {isSubtask ? <p className="field-help">Area is inherited from the parent task.</p> : null}
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
                disabled={status === "done" && openSubtaskCount > 0}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="field-group">
        <span className="field-group__label">Type</span>
        <div
          className={`segmented-control ${
            availableTaskTypes.length === 4 ? "segmented-control--four-up" : "segmented-control--three-up"
          }`}
        >
          {availableTaskTypes.map((taskType) => (
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

      {!isSubtask ? (
        <div className="field-group">
          <div className="subtask-section__header">
            <span className="field-group__label">Subtasks</span>
            <span className="today-area-panel__section-count">{subtasks.length}</span>
          </div>

          {subtasks.length > 0 ? (
            <div className="subtask-list">
              {subtasks.map((subtask) => (
                <button
                  key={subtask.id}
                  className="subtask-row"
                  onClick={() => onSelectTask(subtask.id)}
                  type="button"
                >
                  <span className="subtask-row__title">{subtask.title}</span>
                  <span className="subtask-row__meta">
                    {formatTaskType(subtask.taskType)}
                    {subtask.status === "done" ? " · done" : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="field-help">No subtasks yet.</p>
          )}

          <form className="subtask-form" onSubmit={handleCreateSubtask}>
            <input
              onChange={(event) => setSubtaskTitle(event.target.value)}
              placeholder="Add a subtask"
              value={subtaskTitle}
            />
            <button className="secondary-button" disabled={!subtaskTitle.trim()} type="submit">
              Add
            </button>
          </form>
        </div>
      ) : null}
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

function getTypeCount(typeTab, mainTasks, blockedTasks, deadlineTasks, backlogTasks) {
  switch (typeTab) {
    case "main":
      return mainTasks.length;
    case "blocked":
      return blockedTasks.length;
    case "deadline":
      return deadlineTasks.length;
    case "backlog":
      return backlogTasks.length;
    default:
      return 0;
  }
}

function getAvailableTaskTypes(area) {
  if (area === "life") {
    return ["blocked", "deadline", "backlog"];
  }
  return ["main", "blocked", "deadline", "backlog"];
}

function getPrimaryTabCount(tabId, todayCount, openCount, doneCount) {
  switch (tabId) {
    case "today":
      return todayCount;
    case "all":
      return openCount;
    case "done":
      return doneCount;
    default:
      return 0;
  }
}

function getAreaEmptyState(areaTab) {
  switch (areaTab) {
    case "work":
      return "No open work tasks.";
    case "life":
      return "No open life tasks.";
    default:
      return "Nothing here.";
  }
}

function getTypeEmptyState(typeTab) {
  switch (typeTab) {
    case "main":
      return "No main tasks.";
    case "blocked":
      return "No blocked tasks.";
    case "deadline":
      return "No deadlines on the board.";
    case "backlog":
      return "No backlog tasks.";
    default:
      return "Nothing here.";
  }
}

function getTypeTasks(typeTab, mainTasks, blockedTasks, deadlineTasks, backlogTasks) {
  switch (typeTab) {
    case "main":
      return mainTasks;
    case "blocked":
      return blockedTasks;
    case "deadline":
      return deadlineTasks;
    case "backlog":
      return backlogTasks;
    default:
      return mainTasks;
  }
}

function getTypeTaskGroups(typeTab, mainGroups, blockedGroups, deadlineGroups, backlogGroups) {
  switch (typeTab) {
    case "main":
      return mainGroups;
    case "blocked":
      return blockedGroups;
    case "deadline":
      return deadlineGroups;
    case "backlog":
      return backlogGroups;
    default:
      return mainGroups;
  }
}

function createTaskSection(id, title, tasks, rootTasks, childrenByParentId) {
  return {
    id,
    title,
    tasks,
    count: tasks.length,
    groups: buildTaskGroups(rootTasks, childrenByParentId, tasks),
  };
}

function buildChildrenByParentId(tasks) {
  const childrenByParentId = new Map();

  tasks.forEach((task) => {
    if (task.parentId === null) {
      return;
    }

    const children = childrenByParentId.get(task.parentId) ?? [];
    children.push(task);
    childrenByParentId.set(task.parentId, children);
  });

  childrenByParentId.forEach((children, parentId) => {
    childrenByParentId.set(parentId, sortTasks(children));
  });

  return childrenByParentId;
}

function buildOpenChildCountByParentId(tasks) {
  return tasks.reduce((counts, task) => {
    if (task.parentId === null || task.status !== "open") {
      return counts;
    }

    counts.set(task.parentId, (counts.get(task.parentId) ?? 0) + 1);
    return counts;
  }, new Map());
}

function getOpenChildCount(taskId, openChildCountByParentId) {
  return openChildCountByParentId.get(taskId) ?? 0;
}

function buildTaskGroups(
  rootTasks,
  childrenByParentId,
  visibleTasks,
  { includeAllChildrenForMatchingRoot = true } = {},
) {
  const visibleTaskIds = new Set(visibleTasks.map((task) => task.id));

  return rootTasks.reduce((groups, rootTask) => {
    const childTasks = childrenByParentId.get(rootTask.id) ?? [];
    const visibleChildren = childTasks.filter((task) => visibleTaskIds.has(task.id));
    const rootIsVisible = visibleTaskIds.has(rootTask.id);

    if (!rootIsVisible && visibleChildren.length === 0) {
      return groups;
    }

    groups.push({
      root: rootTask,
      children: rootIsVisible && includeAllChildrenForMatchingRoot ? childTasks : visibleChildren,
    });

    return groups;
  }, []);
}

function sortTaskGroupsByCompletedAt(groups) {
  return [...groups].sort((left, right) => getGroupLatestCompletedAt(right) - getGroupLatestCompletedAt(left));
}

function getGroupLatestCompletedAt(group) {
  return [group.root, ...group.children].reduce((latestTimestamp, task) => {
    if (!task.completedAt) {
      return latestTimestamp;
    }

    return Math.max(latestTimestamp, new Date(task.completedAt).getTime());
  }, 0);
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

function getEndOfLocalDay(date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isOnOrBefore(value, deadline) {
  if (!value) {
    return false;
  }
  return new Date(value).getTime() <= deadline.getTime();
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

function sortCompletedTasks(tasks) {
  return [...tasks].sort((left, right) => {
    const leftCompleted = left.completedAt ? new Date(left.completedAt).getTime() : 0;
    const rightCompleted = right.completedAt ? new Date(right.completedAt).getTime() : 0;
    if (leftCompleted !== rightCompleted) {
      return rightCompleted - leftCompleted;
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
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
