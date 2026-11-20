import type {Task, TaskFilter} from './types.js';

export {taskTitleMinimumProblem as titleProblem} from './task-input-schema.js';

export function filterTasks(tasks: Task[], query: string, filter: TaskFilter): Task[] {
  const needle = query.trim().toLowerCase();
  return tasks.filter(task => (filter === 'all' || task.status === filter)
    && `${task.id} ${task.title} ${task.assignee} ${task.description}`.toLowerCase().includes(needle));
}

export function taskSummary(tasks: Task[]): string {
  const count = (status: Task['status']) => tasks.filter(task => task.status === status).length;
  return `${tasks.length} tasks · ${count('open')} open · ${count('in-progress')} in progress · ${count('done')} completed`;
}

export function nextTaskNumber(tasks: Task[]): number {
  return tasks.reduce((highest, task) => {
    const match = /^TASK-(\d+)$/.exec(task.id);
    const value = match ? Number(match[1]) : 0;
    return Number.isSafeInteger(value) ? Math.max(highest, value) : highest;
  }, 0) + 1;
}
