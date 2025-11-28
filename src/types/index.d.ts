export interface Change {
    id: string;
    title: string;
    description?: string;
    progress: number;
    totalTasks: number;
    completedTasks: number;
}
export interface Task {
    id: string;
    title: string;
    completed: boolean;
    groupId: string;
    lineNumber: number;
}
export interface TaskGroup {
    id: string;
    title: string;
    tasks: Task[];
}
export interface TasksFile {
    changeId: string;
    groups: TaskGroup[];
}
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}
export interface ChangesResponse {
    changes: Change[];
}
export interface TasksResponse {
    changeId: string;
    groups: TaskGroup[];
}
export interface ToggleTaskResponse {
    task: Task;
}
export interface DetailPlan {
    taskId: string;
    changeId: string;
    content: string;
    exists: boolean;
}
export interface Spec {
    id: string;
    title: string;
    requirementsCount: number;
}
export interface SpecsResponse {
    specs: Spec[];
}
export interface SpecContentResponse {
    id: string;
    content: string;
}
export interface Project {
    id: string;
    name: string;
    path: string;
    addedAt: string;
}
export interface ProjectsResponse {
    projects: Project[];
    activeProjectId: string | null;
}
//# sourceMappingURL=index.d.ts.map