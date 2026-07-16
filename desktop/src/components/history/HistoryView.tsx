import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useApp } from "../../context/AppContext";
import { useClips } from "../../context/ClipsContext";
import { useLanguage } from "../../context/LanguageContext";
import { useFreshClip } from "../../hooks/useFreshClip";
import { Icon } from "../ui/Icon";
import { tauri } from "../../lib/tauri";
import type { Clip } from "../../lib/types";
import { ClipCard } from "./ClipCard";
import { FilterChips, type ClipFilter } from "./FilterChips";
import { EmptyState } from "./EmptyState";
import { Footer } from "./Footer";
import { SearchHeader } from "./SearchHeader";

export function HistoryView() {
  const { goTo, paused } = useApp();
  const { t } = useLanguage();
  const { clips, wsStatus, isHidden, toggleHide, copyClip, removeClip, undoDelete, pendingDeletes, togglePin } = useClips();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ClipFilter>("all");
  const [selected, setSelected] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const freshId = useFreshClip(clips);

  const filtered = useMemo(() => {
    let base = clips;
    if (filter === "pinned") base = base.filter((c) => c.pinned);
    else if (filter !== "all") base = base.filter((c) => c.kind === filter);
    if (search) base = base.filter((c) => c.text.toLowerCase().includes(search.toLowerCase()));
    // Épinglés en tête (tri stable : l'ordre serveur/récence est conservé sinon).
    return [...base].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [clips, search, filter]);

  // Garde la sélection dans les bornes quand la liste change.
  useEffect(() => {
    setSelected((s) => (s >= filtered.length ? Math.max(0, filtered.length - 1) : s));
  }, [filtered.length]);

  // Fait défiler la card sélectionnée dans la vue.
  useEffect(() => {
    document
      .querySelector<HTMLDivElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const focusSearch = useCallback(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  const copy = useCallback(
    (clip: Clip) => {
      copyClip(clip);
      setCopiedId(clip.id);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedId(null), 900);
    },
    [copyClip],
  );

  const activate = useCallback(
    (index: number) => {
      setSelected(index);
      const clip = filtered[index];
      if (clip) copy(clip);
    },
    [filtered, copy],
  );

  // Focus initial + refocus/reset à chaque réouverture de la fenêtre (hotkey/tray).
  useEffect(() => {
    focusSearch();
    const un = getCurrentWindow().listen("tauri://focus", () => {
      setSelected(0);
      focusSearch();
    });
    return () => {
      un.then((off) => off());
    };
  }, [focusSearch]);

  // Navigation clavier façon Raycast.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const clip = filtered[selected];
        if (clip) copy(clip);
      } else if (e.key === "Escape") {
        if (search) {
          setSearch("");
          setSelected(0);
        } else {
          tauri.hideWindow();
        }
      } else if (e.key === "," && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        goTo("settings");
      } else if (e.key === "Backspace" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const clip = filtered[selected];
        if (clip) removeClip(clip.id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filtered, selected, search, copy, goTo, removeClip]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <SearchHeader
        ref={searchRef}
        value={search}
        onChange={(v) => {
          setSearch(v);
          setSelected(0);
        }}
        onOpenSettings={() => goTo("settings")}
      />
      <FilterChips value={filter} onChange={(f) => { setFilter(f); setSelected(0); }} />
      {paused && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[#fde68a] bg-[#fffbeb] px-4 py-2 text-[11.5px] font-medium text-[#b45309] dark:border-[#78350f] dark:bg-[#78350f]/20 dark:text-[#fbbf24] select-none">
          <Icon name="pause" className="h-3.5 w-3.5 shrink-0 stroke-[2]" />
          <span>{t("pausedBanner")}</span>
        </div>
      )}
      <div className="scroll-slim flex flex-1 flex-col gap-[6px] overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <EmptyState searching={!!search} />
        ) : (
          filtered.map((clip, i) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              index={i}
              selected={i === selected}
              fresh={clip.id === freshId}
              copied={clip.id === copiedId}
              masked={isHidden(clip.id)}
              onSelect={setSelected}
              onActivate={activate}
              onToggleHide={toggleHide}
              onDelete={removeClip}
              onTogglePin={togglePin}
            />
          ))
        )}
      </div>
      {pendingDeletes.length > 0 && (
        <div className="anim-slide-in flex shrink-0 items-center gap-3 border-t border-border bg-surface px-4 py-2.5 select-none">
          <Icon name="trash" className="h-3.5 w-3.5 shrink-0 stroke-[1.75] text-dim" />
          <span className="flex-1 truncate text-[12px] text-dim">
            {t("deleted")}
            {pendingDeletes.length > 1 ? ` (${pendingDeletes.length})` : ""}
          </span>
          <button
            onClick={() => undoDelete(pendingDeletes[pendingDeletes.length - 1].id)}
            className="rounded-md bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent transition hover:bg-accent hover:text-white cursor-pointer"
          >
            {t("undoDelete")}
          </button>
        </div>
      )}
      <Footer wsStatus={wsStatus} />
    </div>
  );
}
