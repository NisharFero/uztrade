import { Icon } from "../icons";
import type { AgentTask, TaskStatus } from "../../modules/documents/agent-tasks";

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Not done",
  running: "In progress",
  done: "Done",
};

/** Unticked ring / spinner / tick - the three states an agent step can be in. */
export function TaskMark({ status }: { status: TaskStatus }) {
  return (
    <span className="task-mark" data-status={status} role="img" aria-label={STATUS_LABEL[status]}>
      {status === "done" ? Icon.check : status === "running" ? Icon.loader : null}
    </span>
  );
}

export function TaskList({ tasks }: { tasks: AgentTask[] }) {
  return (
    <ul className="task-list">
      {tasks.map((t) => (
        <li key={t.key} className="task-row" data-status={t.status} data-severity={t.severity}>
          <TaskMark status={t.status} />
          <span className="task-main">
            <strong>{t.label}</strong>
            <small>{t.detail}</small>
          </span>
          <span className="task-note">{t.note}</span>
        </li>
      ))}
    </ul>
  );
}

/** Aggregate mark for a group: done when every task is, spinning while any
 *  task is being worked, otherwise unticked. */
export function groupStatus(tasks: AgentTask[]): TaskStatus {
  if (tasks.every((t) => t.status === "done")) return "done";
  if (tasks.some((t) => t.status === "running")) return "running";
  return "pending";
}
