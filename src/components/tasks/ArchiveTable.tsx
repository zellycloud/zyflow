import { Search, RefreshCw, RotateCcw, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Task, PRIORITY_COLORS } from './types';

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ArchiveTableProps {
  tasks: Task[];
  pagination: PaginationInfo;
  searchQuery: string;
  isLoading: boolean;
  onSearchChange: (query: string) => void;
  onPageChange: (page: number) => void;
  onUnarchive: (id: number) => void;
  onDelete: (id: number) => void;
  onRefresh: () => void;
}

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    return JSON.parse(tagsJson);
  } catch {
    return [];
  }
}

export function ArchiveTable({
  tasks,
  pagination,
  searchQuery,
  isLoading,
  onSearchChange,
  onPageChange,
  onUnarchive,
  onDelete,
  onRefresh,
}: ArchiveTableProps) {

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-4 p-4 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search archived tasks..."
            className="pl-9"
          />
        </div>

        <div className="text-sm text-muted-foreground">
          Total: {pagination.total} tasks
        </div>

        <Button variant="outline" size="icon" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-[80px]">Priority</TableHead>
              <TableHead className="w-[150px]">Tags</TableHead>
              <TableHead className="w-[100px]">Completed</TableHead>
              <TableHead className="w-[100px]">Archived</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {isLoading ? 'Loading...' : 'No archived tasks found'}
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-mono text-xs">{task.id}</TableCell>
                  <TableCell>
                    <div className="font-medium">{task.title}</div>
                    {task.description && (
                      <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                        {task.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority]}`}
                      />
                      <span className="text-xs capitalize">{task.priority}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {parseTags(task.tags).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDate(task.updatedAt)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDate(task.archivedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onUnarchive(task.id)}
                        title="Restore to Done"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => onDelete(task.id)}
                        title="Delete permanently"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <div className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
