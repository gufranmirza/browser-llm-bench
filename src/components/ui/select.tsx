"use client";
import * as SelectPrimitive from "@radix-ui/react-select";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useRef } from "react";
export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  group?: string;
  visual?: ReactNode;
};
const EMPTY = "__empty_filter__";
/** Radix handles focus, typeahead, keyboard selection, dismissal and touch. */
export function Select({
  label,
  value,
  onValueChange,
  options,
  disabled,
  icon: Icon,
  className = "",
  navigation = false,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  icon?: LucideIcon;
  className?: string;
  navigation?: boolean;
}) {
  const descriptionPrefix = useId();
  const pendingNavigation = useRef<string | null>(null);
  const item = (o: SelectOption) => (
    <SelectPrimitive.Item
      key={o.value}
      value={o.value || EMPTY}
      disabled={o.disabled}
      textValue={o.label}
      aria-describedby={
        o.description ? `${descriptionPrefix}-${options.indexOf(o)}` : undefined
      }
      className="select-item"
    >
      {o.visual && (
        <span className="select-option-visual" aria-hidden="true">
          {o.visual}
        </span>
      )}
      <span className="select-item-copy">
        <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
        {o.description && (
          <small id={`${descriptionPrefix}-${options.indexOf(o)}`}>
            {o.description}
          </small>
        )}
      </span>
      <SelectPrimitive.ItemIndicator className="select-check">
        <Check size={16} aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
  const groups = [...new Set(options.map((o) => o.group || ""))];
  return (
    <SelectPrimitive.Root
      value={value || EMPTY}
      onValueChange={(v) => {
        const next = v === EMPTY ? "" : v;
        if (navigation) pendingNavigation.current = next;
        else onValueChange(next);
      }}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-label={label}
        className={`select-trigger ${className}`}
      >
        {Icon && (
          <Icon size={16} className="select-leading-icon" aria-hidden="true" />
        )}
        {options.find((o) => o.value === value)?.visual && (
          <span className="select-option-visual" aria-hidden="true">
            {options.find((o) => o.value === value)?.visual}
          </span>
        )}
        <span className="select-value">
          <SelectPrimitive.Value
            placeholder={`Choose ${label.toLowerCase()}`}
          />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            size={16}
            className="select-chevron"
            aria-hidden="true"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          onCloseAutoFocus={(event) => {
            if (pendingNavigation.current !== null) {
              event.preventDefault();
              const next = pendingNavigation.current;
              pendingNavigation.current = null;
              requestAnimationFrame(() => onValueChange(next));
            }
          }}
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="select-content"
        >
          <SelectPrimitive.ScrollUpButton className="select-scroll">
            <ChevronUp size={16} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="select-viewport">
            {groups.map((group) =>
              group ? (
                <SelectPrimitive.Group key={group}>
                  <SelectPrimitive.Label className="select-group-label">
                    {group}
                  </SelectPrimitive.Label>
                  {options.filter((o) => o.group === group).map(item)}
                </SelectPrimitive.Group>
              ) : (
                options.filter((o) => !o.group).map(item)
              ),
            )}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="select-scroll">
            <ChevronDown size={16} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
