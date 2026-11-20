import type {TaskInput} from './task-input-schema.js';

export type {TaskInput} from './task-input-schema.js';
export type TaskStatus = 'open' | 'in-progress' | 'done';
export type TaskPriority = TaskInput['priority'];

export interface Task extends TaskInput {
  id: string;
  status: TaskStatus;
}

export type TaskFilter = 'all' | TaskStatus;
