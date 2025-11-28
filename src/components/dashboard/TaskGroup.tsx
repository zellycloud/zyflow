import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { TaskGroup as TaskGroupType } from '@/types'
import { SortableTaskItem } from './SortableTaskItem'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TaskGroupProps {
  group: TaskGroupType
  onToggle: (taskId: string) => void
  onReorder: (groupId: string, taskIds: string[]) => void
  onExecute: (taskId: string, taskTitle: string) => void
  changeId: string
  isExecuting?: boolean
}

export function TaskGroup({ group, onToggle, onReorder, onExecute, changeId, isExecuting }: TaskGroupProps) {
  const completedCount = group.tasks.filter((t) => t.completed).length
  const totalCount = group.tasks.length

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = group.tasks.findIndex((t) => t.id === active.id)
      const newIndex = group.tasks.findIndex((t) => t.id === over.id)
      const newTasks = arrayMove(group.tasks, oldIndex, newIndex)
      onReorder(group.id, newTasks.map((t) => t.id))
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{group.title}</CardTitle>
          <span className="text-sm text-muted-foreground">
            {completedCount}/{totalCount}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={group.tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {group.tasks.map((task) => (
                <SortableTaskItem
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  onExecute={onExecute}
                  changeId={changeId}
                  isExecuting={isExecuting}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </CardContent>
    </Card>
  )
}
