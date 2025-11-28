import { useState } from 'react';
import { LayoutGrid, Archive } from 'lucide-react';
import { useKanbanTasks } from '../../hooks/useKanbanTasks';
import { useArchivedTasks } from '../../hooks/useArchivedTasks';
import { KanbanBoard } from '../tasks/KanbanBoard';
import { ArchiveTable } from '../tasks/ArchiveTable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { ConfirmDialog } from '../ui/confirm-dialog';
import type { TaskStatus, TaskPriority } from '../tasks/types';

export function TasksPage() {
  const {
    tasks,
    isLoading: kanbanLoading,
    refetch: refetchKanban,
    createTask,
    updateTask,
    deleteTask: deleteKanbanTask,
    archiveTask,
  } = useKanbanTasks();

  const {
    tasks: archivedTasks,
    pagination,
    searchQuery,
    isLoading: archiveLoading,
    refetch: refetchArchive,
    setSearchQuery,
    setPage,
    unarchiveTask,
    deleteTask: deleteArchivedTask,
  } = useArchivedTasks();

  // Delete confirmation state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    taskId: number | null;
    isArchived: boolean;
  }>({ open: false, taskId: null, isArchived: false });

  const handleCreateTask = async (data: {
    title: string;
    description?: string;
    status: TaskStatus;
    priority: TaskPriority;
    tags?: string[];
    assignee?: string;
  }) => {
    await createTask(data);
  };

  const handleUpdateTask = async (
    id: string,
    data: {
      title?: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      tags?: string[];
      assignee?: string;
      order?: number;
    }
  ) => {
    await updateTask(id, data);
  };

  const handleDeleteKanbanTask = (id: number) => {
    setDeleteDialog({ open: true, taskId: id, isArchived: false });
  };

  const handleDeleteArchivedTask = (id: number) => {
    setDeleteDialog({ open: true, taskId: id, isArchived: true });
  };

  const confirmDelete = async () => {
    if (!deleteDialog.taskId) return;

    if (deleteDialog.isArchived) {
      await deleteArchivedTask(deleteDialog.taskId);
    } else {
      await deleteKanbanTask(deleteDialog.taskId);
    }

    setDeleteDialog({ open: false, taskId: null, isArchived: false });
  };

  const handleArchiveTask = async (id: number) => {
    await archiveTask(id);
    refetchArchive();
  };

  const handleUnarchiveTask = async (id: number) => {
    await unarchiveTask(id);
    refetchKanban();
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs defaultValue="kanban" className="h-full">
        <div className="px-4 pt-4">
          <TabsList>
            <TabsTrigger value="kanban" className="gap-1.5">
              <LayoutGrid className="h-4 w-4" />
              Kanban
            </TabsTrigger>
            <TabsTrigger value="archive" className="gap-1.5">
              <Archive className="h-4 w-4" />
              Archive
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="kanban" className="flex-1 mt-0">
          <KanbanBoard
            tasks={tasks}
            onCreateTask={handleCreateTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteKanbanTask}
            onArchiveTask={handleArchiveTask}
            onRefresh={() => refetchKanban()}
            isLoading={kanbanLoading}
          />
        </TabsContent>

        <TabsContent value="archive" className="flex-1 mt-0">
          <ArchiveTable
            tasks={archivedTasks}
            pagination={pagination}
            searchQuery={searchQuery}
            isLoading={archiveLoading}
            onSearchChange={setSearchQuery}
            onPageChange={setPage}
            onUnarchive={handleUnarchiveTask}
            onDelete={handleDeleteArchivedTask}
            onRefresh={() => refetchArchive()}
          />
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          setDeleteDialog((prev) => ({ ...prev, open }))
        }
        title="Delete Task"
        description={
          deleteDialog.isArchived
            ? "This will permanently delete the task. This action cannot be undone."
            : "Are you sure you want to delete this task? This action cannot be undone."
        }
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </div>
  );
}
