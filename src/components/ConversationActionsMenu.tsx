"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  conversationsApi,
  useArchiveConversation,
  useDeleteConversation,
  usePinConversation,
  useRenameConversation,
} from "@/lib/api/conversations";
import {
  conversationDetailToMarkdown,
  downloadTextFile,
  slugifyFilename,
} from "@/lib/chat/exportMarkdown";
import { conversationDetailToPdf } from "@/lib/chat/exportPdf";
import { useToast } from "./Toast";
import { useDialog } from "./Dialog";
import ShareModal from "./ShareModal";
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

function PinIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill={filled ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 17v5" />
      <path d="M9 10.76V4h6v6.76a2 2 0 0 0 .59 1.42L17 13.5V15H7v-1.5l1.41-1.32A2 2 0 0 0 9 10.76z" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 15h6M9 18h6M9 12h2" />
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
  const { toast } = useToast();
  const rename = useRenameConversation();
  const del = useDeleteConversation();
  const pin = usePinConversation();
  const archive = useArchiveConversation();

  const togglePin = React.useCallback(
    (id: string, pinned: boolean) => pin.mutate({ sessionId: id, pinned: !pinned }),
    [pin],
  );
  const toggleArchive = React.useCallback(
    (id: string, archived: boolean) => archive.mutate({ sessionId: id, archived: !archived }),
    [archive],
  );

  const exportMarkdown = React.useCallback(
    async (id: string, label: string) => {
      try {
        const detail = await conversationsApi.get(id);
        const md = conversationDetailToMarkdown(label, detail);
        downloadTextFile(`${slugifyFilename(label)}.md`, md);
      } catch {
        toast("Couldn't export that conversation.", "error");
      }
    },
    [toast],
  );

  const exportPdf = React.useCallback(
    async (id: string, label: string) => {
      try {
        const detail = await conversationsApi.get(id);
        conversationDetailToPdf(label, detail); // opens the print → Save-as-PDF dialog
      } catch {
        toast("Couldn't export that conversation.", "error");
      }
    },
    [toast],
  );

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

  return { requestRename, requestDelete, togglePin, toggleArchive, exportMarkdown, exportPdf };
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
  pinned = false,
  archived = false,
  buttonClassName,
}: {
  id: string;
  label: string;
  pinned?: boolean;
  archived?: boolean;
  buttonClassName?: string;
}) {
  const { requestRename, requestDelete, togglePin, toggleArchive, exportMarkdown, exportPdf } =
    useConversationActions();
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((o) => !o);
  };

  // Position the menu AFTER it renders so we can measure its real size, then
  // flip it ABOVE the button when there isn't room below (e.g. the last items
  // in the sidebar) and clamp to the viewport edges. useLayoutEffect runs
  // before paint, so there's no visible jump.
  React.useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    const el = menuRef.current;
    if (!r || !el) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const gap = 4;
    const margin = 8;
    let top = r.bottom + gap;
    if (top + h > window.innerHeight - margin) {
      top = Math.max(margin, r.top - h - gap); // flip above the button
    }
    const left = Math.max(margin, Math.min(r.right - w, window.innerWidth - w - margin));
    setPos({ top, left });
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
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
  }, [open]);

  const runAction = (action: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    action();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={cn(styles.menuBtn, buttonClassName)}
        data-open={open ? "true" : undefined}
        title="Conversation options"
        aria-label="Conversation options"
        aria-haspopup="menu"
        aria-expanded={open ? true : false}
        onClick={toggleMenu}
      >
        <KebabIcon />
      </button>
      {open && (
        <div
          ref={menuRef}
          className={styles.menu}
          role="menu"
          // Until measured (useLayoutEffect), render off-screen + hidden so the
          // first paint is already in the correct flipped/clamped position.
          style={{
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            visibility: pos ? "visible" : "hidden",
          }}
        >
          <button type="button" role="menuitem" className={styles.menuItem} onClick={runAction(() => togglePin(id, pinned))}>
            <PinIcon filled={pinned} />
            {pinned ? "Unpin" : "Pin"}
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={runAction(() => requestRename(id, label))}>
            <RenameIcon />
            Rename
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={runAction(() => void exportMarkdown(id, label))}>
            <ExportIcon />
            Export as Markdown
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={runAction(() => void exportPdf(id, label))}>
            <PdfIcon />
            Export as PDF
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={runAction(() => setShareOpen(true))}>
            <ShareIcon />
            Share link
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={runAction(() => toggleArchive(id, archived))}>
            <ArchiveIcon />
            {archived ? "Unarchive" : "Archive"}
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
      <ShareModal
        sessionId={id}
        label={label}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </>
  );
}
