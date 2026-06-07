"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { useDeleteConversation, useRenameConversation } from "@/lib/api/conversations";
import { useDialog } from "./Dialog";
import TrashIcon from "./TrashIcon";

import styles from "./ConversationActionsMenu.module.css";

/** Three-dot "more options" glyph (matches Claude / ChatGPT / Gemini). */
function KebabIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function RenameIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

/**
 * Rename / delete actions for a conversation, each gated by a dialog (prompt /
 * danger-confirm) so a stray click never destroys or mangles a conversation.
 * The underlying mutations apply optimistic cache updates, so the list reflects
 * the change instantly. Shared by the sidebar Recent list and My Activity so
 * both behave identically.
 */
export function useConversationActions() {
  const dialog = useDialog();
  const rename = useRenameConversation();
  const del = useDeleteConversation();

  const requestRename = React.useCallback(
    async (id: string, label: string) => {
      const name = await dialog.prompt({
        title: "Rename conversation",
        label: "Name",
        defaultValue: label,
        confirmLabel: "Save",
      });
      if (name && name !== label) rename.mutate({ sessionId: id, title: name });
    },
    [dialog, rename],
  );

  const requestDelete = React.useCallback(
    async (id: string, label: string) => {
      const ok = await dialog.confirm({
        title: "Delete conversation?",
        message: <>“{label}” will be permanently deleted. This can’t be undone.</>,
        confirmLabel: "Delete",
        danger: true,
      });
      if (ok) del.mutate(id);
    },
    [dialog, del],
  );

  return { requestRename, requestDelete };
}

/**
 * The "⋯" button + its Rename/Delete popup. The menu is fixed-positioned
 * (anchored to the button) so it isn't clipped by a scroll container, and
 * closes on outside-click / Escape / scroll / resize. `buttonClassName` lets
 * each surface style the trigger to match (faint in the sidebar, round in My
 * Activity); the popup itself is shared.
 */
export default function ConversationActionsMenu({
  id,
  label,
  buttonClassName,
}: {
  id: string;
  label: string;
  buttonClassName?: string;
}) {
  const { requestRename, requestDelete } = useConversationActions();
  const [menu, setMenu] = React.useState<{ top: number; left: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (menu) {
      setMenu(null);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Right-align a ~172px menu under the button; clamp to the viewport edge.
    setMenu({ top: r.bottom + 4, left: Math.max(8, r.right - 172) });
  };

  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    // Outside-click by ref containment (NOT propagation): in the App Router
    // React's event root is `document`, so a child's stopPropagation can't block
    // this same-document listener — relying on it closed the menu before the
    // item's click could land.
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const runAction = (action: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenu(null);
    action();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={cn(styles.menuBtn, buttonClassName)}
        data-open={menu ? "true" : undefined}
        title="Conversation options"
        aria-label="Conversation options"
        aria-haspopup="menu"
        aria-expanded={menu ? true : false}
        onClick={toggleMenu}
      >
        <KebabIcon />
      </button>
      {menu && (
        <div
          ref={menuRef}
          className={styles.menu}
          role="menu"
          style={{ top: menu.top, left: menu.left }}
        >
          <button type="button" role="menuitem" className={styles.menuItem} onClick={runAction(() => requestRename(id, label))}>
            <RenameIcon />
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className={cn(styles.menuItem, styles.menuItemDanger)}
            onClick={runAction(() => requestDelete(id, label))}
          >
            <TrashIcon size={14} />
            Delete
          </button>
        </div>
      )}
    </>
  );
}
