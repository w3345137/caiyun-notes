import React from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// 通用拖拽包装器 - 包裹可排序项
interface SortableWrapperProps {
  id: string;
  children: React.ReactNode;
}

export const SortableWrapper: React.FC<SortableWrapperProps> = ({ id, children }) => {
  const {
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners}>
      {children}
    </div>
  );
};

// 兼容旧版别名
export const SectionWrapper = SortableWrapper;
export const PageWrapper = SortableWrapper;

// 分区拖拽区域
interface SectionsDndAreaProps {
  sectionIds: string[];
  onReorder: (newSectionIds: string[]) => void;
  children: React.ReactNode;
}

export const SectionsDndArea: React.FC<SectionsDndAreaProps> = ({
  sectionIds,
  onReorder,
  children,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sectionIds.indexOf(active.id as string);
    const newIndex = sectionIds.indexOf(over.id as string);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(arrayMove(sectionIds, oldIndex, newIndex));
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
};

// 页面拖拽区域
interface PagesDndAreaProps {
  pageIds: string[];
  onReorder: (newPageIds: string[]) => void;
  children: React.ReactNode;
}

export const PagesDndArea: React.FC<PagesDndAreaProps> = ({
  pageIds,
  onReorder,
  children,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = pageIds.indexOf(active.id as string);
    const newIndex = pageIds.indexOf(over.id as string);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(arrayMove(pageIds, oldIndex, newIndex));
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={pageIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
};
