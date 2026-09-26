import { X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/shared/lib/utils';

/** Height cap of the list, in px; also decides whether it opens upwards. */
const LIST_MAX_HEIGHT = 224;

interface ListPosition {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  /** Selected values, in selection order. */
  value: string[];
  onChange: (value: string[]) => void;
  /** Accessible name of the input. */
  label: string;
  placeholder?: string;
  emptyText: string;
  /** Accessible name of the remove button of a chip. */
  removeLabel: (label: string) => string;
  disabled?: boolean;
  className?: string;
}

/**
 * A multiple-selection combobox: typing filters the options, choosing one turns it into a chip
 * inside the field and keeps the list open for the next one.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  label,
  placeholder,
  emptyText,
  removeLabel,
  disabled,
  className,
}: MultiSelectProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<ListPosition | null>(null);

  // The list is portalled and fixed to the viewport, so a scrolling ancestor cannot clip it.
  useEffect(() => {
    const field = fieldRef.current;
    if (!open || !field) return;
    const place = () => {
      const rect = field.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom;
      const upwards = below < LIST_MAX_HEIGHT && rect.top > below;
      setPosition({
        left: rect.left,
        width: rect.width,
        ...(upwards ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const selected = value.flatMap((item) => options.filter((option) => option.value === item));
  const needle = query.trim().toLowerCase();
  const available = options.filter(
    (option) => !value.includes(option.value) && option.label.toLowerCase().includes(needle),
  );
  const activeIndex = Math.min(active, Math.max(available.length - 1, 0));
  const optionId = (index: number) => `${listId}-${index}`;

  const add = (option: MultiSelectOption) => {
    onChange([...value, option.value]);
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
  };
  const remove = (item: string) => {
    onChange(value.filter((current) => current !== item));
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const count = Math.max(available.length, 1);
      setActive((activeIndex + step + count) % count);
    } else if (event.key === 'Enter') {
      const option = available[activeIndex];
      if (open && option) {
        event.preventDefault();
        add(option);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.stopPropagation();
        setOpen(false);
      }
    } else if (event.key === 'Backspace' && query === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className={cn('min-w-0', className)}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the click only forwards focus to the input, which owns the keyboard. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: same. */}
      <div
        ref={fieldRef}
        className={cn(
          'flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-xs',
          'focus-within:ring-2 focus-within:ring-ring',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((option) => (
          <span
            key={option.value}
            className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
          >
            {option.label}
            <button
              type="button"
              aria-label={removeLabel(option.label)}
              disabled={disabled}
              className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(event) => {
                event.stopPropagation();
                remove(option.value);
              }}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && available.length > 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          className="min-w-24 flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
          disabled={disabled}
          placeholder={selected.length === 0 ? placeholder : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open &&
        position &&
        createPortal(
          <div
            id={listId}
            role="listbox"
            aria-label={label}
            aria-multiselectable="true"
            style={{ ...position, maxHeight: LIST_MAX_HEIGHT }}
            className="fixed z-50 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {available.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</div>
            ) : (
              available.map((option, index) => (
                // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/useFocusableInteractive: the input owns the keyboard (aria-activedescendant), the option only takes the pointer.
                <div
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={false}
                  className={cn(
                    'cursor-pointer rounded-sm px-2 py-1.5 text-sm',
                    index === activeIndex && 'bg-accent text-accent-foreground',
                  )}
                  // Keeps the focus in the input, so the list stays open between two picks.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => add(option)}
                >
                  {option.label}
                </div>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
