import { bindFormSchema } from '../../src/form-schema.js';
import { taskInputSchema } from './task-input-schema.js';

export const taskDraftForm = bindFormSchema(taskInputSchema, ['title', 'assignee', 'description', 'priority']);
