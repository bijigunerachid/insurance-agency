import { CheckIcon } from '@heroicons/react/20/solid';
import { useEffect, useId, useRef, useState } from 'react';

/**
 * A small menu opened by a button (the space switch, the profile). Keyboard: Enter, Space or
 * the down arrow open it on the first (or the checked) item; arrows, Home and End move; Enter
 * chooses; Escape or Tab closes and gives the focus back to the button. A click outside closes it.
 *
 * `items` = [{ key, label, onSelect, icon?, leading?, checked?, danger? } | { key, separator: true } |
 * { key, heading }]: an item with `checked` (true or false) is one of a choice (menuitemradio).
 * `renderButton(props)` draws the button; `label` is the menu's accessible name.
 */
export function Menu({ label, items, renderButton, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const actionable = items.filter((item) => item.onSelect);

  const focusItem = (index) => {
    const nodes = menuRef.current?.querySelectorAll('[role^="menuitem"]');
    if (!nodes?.length) return;
    nodes[(index + nodes.length) % nodes.length].focus();
  };
  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const start = Math.max(
      0,
      actionable.findIndex((item) => item.checked),
    );
    focusItem(start);
    const onPointer = (event) => {
      if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
    // Focus once when opening; the items do not change while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onMenuKey = (event) => {
    const nodes = [...menuRef.current.querySelectorAll('[role^="menuitem"]')];
    const index = nodes.indexOf(document.activeElement);
    const keys = {
      ArrowDown: () => focusItem(index + 1),
      ArrowUp: () => focusItem(index - 1),
      Home: () => focusItem(0),
      End: () => focusItem(nodes.length - 1),
      Escape: () => close(),
      Tab: () => close(false),
    };
    if (!keys[event.key]) return;
    if (event.key !== 'Tab') event.preventDefault();
    keys[event.key]();
  };

  return (
    <div className="relative">
      {renderButton({
        ref: buttonRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onClick: () => setOpen((value) => !value),
        onKeyDown: (event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        },
      })}
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={`absolute top-full z-50 mt-2 min-w-56 animate-enter overflow-hidden rounded-card border border-line bg-surface py-1 shadow-raised ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item) => {
            if (item.separator) {
              return <div key={item.key} role="separator" className="my-1 border-t border-line" />;
            }
            if (item.heading) {
              return (
                <div key={item.key} className="px-3 pb-1.5 pt-2" aria-hidden="true">
                  {item.heading}
                </div>
              );
            }
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked === undefined ? undefined : item.checked}
                tabIndex={-1}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm outline-none hover:bg-canvas focus:bg-canvas ${
                  item.danger ? 'text-danger-ink' : 'text-ink'
                }`}
              >
                {Icon && <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />}
                {item.leading}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.checked && (
                  <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
