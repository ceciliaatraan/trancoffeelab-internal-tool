"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatOreWhole } from "@/lib/format";
import type { LocationStats } from "@/lib/kassa/locations";
import {
  saveLocationOrderAction,
  setLocationArchivedAction,
} from "@/app/(kassa)/kassa/installningar/actions";
import { SubmitButton } from "@/components/submit-button";

const rowGrid =
  "grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-4 sm:grid-cols-[2.5rem_1fr_6rem_7rem_6rem_3rem_5.5rem]";

function SortableRow({ location }: { location: LocationStats }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: location.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${rowGrid} relative border-b border-tran-hairline bg-tran-white py-3 text-sm ${
        isDragging ? "z-10 shadow-lg" : ""
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Flytta ${location.name}`}
        className="flex h-10 w-10 cursor-grab touch-none items-center justify-center text-lg text-tran-muted hover:text-tran-black active:cursor-grabbing"
      >
        ⋮⋮
      </button>
      <div className="min-w-0">
        <p className={`truncate ${location.archived ? "text-tran-muted" : ""}`}>
          {location.name}
          {location.archived ? " (arkiverat)" : ""}
        </p>
        <p className="tran-tabular text-xs text-tran-muted sm:hidden">
          Idag {formatOreWhole(location.todayOre)} · Månad {formatOreWhole(location.monthOre)} · Totalt{" "}
          {formatOreWhole(location.allTimeOre)}
        </p>
      </div>
      <span className="tran-tabular hidden text-right sm:block">{formatOreWhole(location.todayOre)}</span>
      <span className="tran-tabular hidden text-right sm:block">{formatOreWhole(location.monthOre)}</span>
      <span className="tran-tabular hidden text-right sm:block">{formatOreWhole(location.allTimeOre)}</span>
      <span className="tran-tabular hidden text-right sm:block">{location.saleCount}</span>
      <form action={setLocationArchivedAction.bind(null, location.id, !location.archived)} className="text-right">
        <SubmitButton className="tran-label text-xs underline hover:text-tran-red">
          {location.archived ? "Återställ" : "Arkivera"}
        </SubmitButton>
      </form>
    </li>
  );
}

/**
 * Försäljningsställena med försäljning per ställe - dra i ⋮⋮ för att ändra
 * ordningen (den gäller i kassan). Fungerar med mus, finger och tangentbord
 * (mellanslag för att lyfta, piltangenter, mellanslag för att släppa).
 * Ordningen sparas direkt när man släpper.
 */
export function LocationOrderList({ locations }: { locations: LocationStats[] }) {
  const [items, setItems] = useState(locations);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const previous = items;
    const next = arrayMove(
      items,
      items.findIndex((item) => item.id === active.id),
      items.findIndex((item) => item.id === over.id),
    );
    setItems(next);
    setStatus(null);
    startTransition(async () => {
      const result = await saveLocationOrderAction(next.map((item) => item.id));
      if (result.ok) {
        setStatus({ kind: "saved", text: "Ordningen är sparad." });
      } else {
        setItems(previous);
        setStatus({ kind: "error", text: result.error ?? "Kunde inte spara ordningen." });
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className={`${rowGrid} tran-label border-b border-tran-hairline pb-2 text-xs text-tran-muted`}>
        <span />
        <span>Ställe</span>
        <span className="hidden text-right sm:block">Idag</span>
        <span className="hidden text-right sm:block">Denna månad</span>
        <span className="hidden text-right sm:block">Totalt</span>
        <span className="hidden text-right sm:block">Köp</span>
        <span />
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <ul>
            {items.map((location) => (
              <SortableRow key={location.id} location={location} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {status ? (
        <p className={`text-sm ${status.kind === "saved" ? "text-tran-green" : "text-tran-red"}`}>{status.text}</p>
      ) : null}
    </div>
  );
}
