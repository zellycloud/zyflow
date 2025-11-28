export interface Project {
    id: string;
    name: string;
    path: string;
    addedAt: string;
}
export interface Config {
    projects: Project[];
    activeProjectId: string | null;
}
export declare function ensureConfigDir(): Promise<void>;
export declare function loadConfig(): Promise<Config>;
export declare function saveConfig(config: Config): Promise<void>;
export declare function addProject(name: string, path: string): Promise<Project>;
export declare function removeProject(projectId: string): Promise<void>;
export declare function setActiveProject(projectId: string): Promise<void>;
export declare function getActiveProject(): Promise<Project | null>;
//# sourceMappingURL=config.d.ts.map