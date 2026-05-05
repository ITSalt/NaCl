import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types';
import type { AppState } from '@excalidraw/excalidraw/types/types';
import type { BinaryFiles } from '@excalidraw/excalidraw/types/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types';
import { useStore } from '../state/store.js';
import type { DiffEntry } from '../state/store.js';

const DEBOUNCE_MS = 800;
const HIGHLIGHT_DURATION_MS = 3000;

/** Build overlay elements from diff entries for rendering. */
function buildDiffOverlay(
  liveElements: readonly ExcalidrawElement[],
  diffEntries: DiffEntry[],
): ExcalidrawElement[] {
  const overlayElements: ExcalidrawElement[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liveMap = new Map<string, any>();
  for (const el of liveElements) {
    liveMap.set(el.id, el);
  }

  for (const entry of diffEntries) {
    if (entry.kind === 'removed') {
      // Ghost: render removed element with red stroke and low opacity
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ghost: any = {
        ...entry.element,
        id: `__diff_removed_${entry.element.id as string}`,
        strokeColor: '#ef4444',
        backgroundColor: 'transparent',
        opacity: 30,
        strokeWidth: 2,
        strokeStyle: 'dashed',
      };
      overlayElements.push(ghost as ExcalidrawElement);
    } else if (entry.kind === 'changed') {
      // Highlight the live element with yellow border overlay
      const liveEl = liveMap.get(entry.after.id as string);
      if (liveEl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const highlight: any = {
          ...liveEl,
          id: `__diff_changed_${liveEl.id as string}`,
          strokeColor: '#eab308',
          backgroundColor: 'transparent',
          opacity: 60,
          strokeWidth: (liveEl.strokeWidth ?? 1) + 2,
          strokeStyle: 'solid',
          fillStyle: 'solid',
        };
        overlayElements.push(highlight as ExcalidrawElement);
      }
    } else if (entry.kind === 'added') {
      // Highlight added element with green border overlay
      const liveEl = liveMap.get(entry.element.id as string);
      if (liveEl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const highlight: any = {
          ...liveEl,
          id: `__diff_added_${liveEl.id as string}`,
          strokeColor: '#22c55e',
          backgroundColor: 'transparent',
          opacity: 60,
          strokeWidth: (liveEl.strokeWidth ?? 1) + 2,
          strokeStyle: 'solid',
          fillStyle: 'solid',
        };
        overlayElements.push(highlight as ExcalidrawElement);
      }
    }
  }

  return overlayElements;
}

export default function CanvasHost() {
  const selectedBoard = useStore((s) => s.selectedBoard);
  const current = useStore((s) => s.current);
  const currentRevision = useStore((s) => s.currentRevision);
  const saveCurrent = useStore((s) => s.saveCurrent);
  const diffMode = useStore((s) => s.diffMode);
  const pendingHighlightElementId = useStore((s) => s.pendingHighlightElementId);
  const clearPendingHighlight = useStore((s) => s.clearPendingHighlight);

  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  // Transient highlight — element id currently being highlighted (yellow box, ~3s)
  const [highlightElementId, setHighlightElementId] = useState<string | null>(null);

  // Excalidraw fires onChange on every interaction (hover, selection, cursor
  // blink) — not only on actual scene mutations. Without a content-equality
  // guard the debounce keeps firing PUTs every DEBOUNCE_MS even when the
  // scene is unchanged. Hash the structural fields and bail when they match
  // the last PUT we sent.
  const lastSavedHashRef = useRef<string | null>(null);

  const sceneSignature = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles): string => {
      // Strip volatile per-render fields so e.g. selection/hover changes don't
      // count as content edits. version+versionNonce DO change on real edits,
      // so we keep them — they're our cheap content fingerprint.
      const elemSig = elements.map((e) => {
        const r = e as unknown as Record<string, unknown>;
        return [r['id'], r['version'], r['versionNonce'], r['updated']];
      });
      return JSON.stringify({
        e: elemSig,
        bg: appState.viewBackgroundColor,
        grid: appState.gridSize,
        files: Object.keys(files).sort(),
      });
    },
    [],
  );

  // Owned debounce timer + the board name the timer is bound to. Cleared
  // whenever the user switches boards so a delayed save can never fire with
  // a stale scene targeting the freshly-selected board (which would silently
  // overwrite the new board's file with the previous board's content).
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      const sig = sceneSignature(elements, appState, files);
      if (sig === lastSavedHashRef.current) return;
      lastSavedHashRef.current = sig;

      // Capture which board this onChange belongs to. If the user switches
      // before the debounce fires, the timer is cleared by the cleanup effect
      // below; the extra runtime guard is a belt for the suspenders.
      const targetBoard = selectedBoard;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const snapshotElements = [...elements];
      const snapshotAppState = {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
      };
      const snapshotFiles = files;
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        if (useStore.getState().selectedBoard !== targetBoard) return;
        const scene = {
          type: 'excalidraw',
          version: 2,
          elements: snapshotElements,
          appState: snapshotAppState,
          files: snapshotFiles,
        };
        void saveCurrent(scene);
      }, DEBOUNCE_MS);
    },
    [sceneSignature, selectedBoard, saveCurrent],
  );

  // Cancel any pending debounced save when the selected board changes (or the
  // component unmounts). Without this, a save scheduled while UC-001 was open
  // could fire after the user switched to Domain Model and overwrite it.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [selectedBoard]);

  // Reset the saved-content hash whenever a new board is loaded. Seed it with
  // the initial scene's signature so the first onChange after load (which
  // Excalidraw fires before any user interaction) does not trigger a phantom
  // PUT that would persist back the same content we just read.
  useEffect(() => {
    if (!current) {
      lastSavedHashRef.current = null;
      return;
    }
    const elements = (current.scene.elements ?? []) as ExcalidrawElement[];
    const appState = (current.scene.appState ?? {}) as AppState;
    const files = (current.scene.files ?? {}) as BinaryFiles;
    lastSavedHashRef.current = sceneSignature(elements, appState, files);
  }, [current, sceneSignature]);

  // Handle pending highlight: scroll to element + set transient highlight id
  useEffect(() => {
    if (!pendingHighlightElementId) return;
    const api = excalidrawApiRef.current;
    if (!api || !current) {
      clearPendingHighlight();
      return;
    }

    const elements = current.scene.elements as ExcalidrawElement[];
    const target = elements.find((el) => el.id === pendingHighlightElementId);
    if (!target) {
      clearPendingHighlight();
      return;
    }

    // Scroll to the element
    try {
      api.scrollToContent([target], { fitToContent: true });
    } catch {
      // scrollToContent may not exist on all versions — ignore
    }

    setHighlightElementId(pendingHighlightElementId);
    clearPendingHighlight();

    // Remove transient highlight after 3 seconds
    const timer = setTimeout(() => {
      setHighlightElementId(null);
    }, HIGHLIGHT_DURATION_MS);

    return () => clearTimeout(timer);
  }, [pendingHighlightElementId, current, clearPendingHighlight]);

  const overlayElements = useMemo(() => {
    if (!current) return [];
    const live = current.scene.elements as ExcalidrawElement[];
    const overlays: ExcalidrawElement[] = [];

    // Diff overlay (Wave 3) — independent of search highlight
    if (diffMode.active) {
      overlays.push(...buildDiffOverlay(live, diffMode.entries));
    }

    // Search highlight overlay — yellow box around found element for ~3s
    if (highlightElementId) {
      const liveMap = new Map<string, ExcalidrawElement>();
      for (const el of live) liveMap.set(el.id, el);
      const target = liveMap.get(highlightElementId);
      if (target) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const highlight: any = {
          ...target,
          id: `__search_highlight_${target.id}`,
          strokeColor: '#f59e0b',
          backgroundColor: 'transparent',
          opacity: 80,
          strokeWidth: (target.strokeWidth ?? 1) + 3,
          strokeStyle: 'solid',
          fillStyle: 'solid',
        };
        overlays.push(highlight as ExcalidrawElement);
      }
    }

    return overlays;
  }, [diffMode.active, diffMode.entries, current, highlightElementId]);

  const displayElements = useMemo(() => {
    if (!current) return [];
    const live = current.scene.elements as ExcalidrawElement[];
    if (overlayElements.length === 0) return live;
    // Overlay elements come after live so they render on top
    return [...live, ...overlayElements];
  }, [current, overlayElements]);

  if (!selectedBoard || !current) {
    return (
      <div className="canvas-placeholder">
        <p>Select a board from the left panel</p>
      </div>
    );
  }

  return (
    <div className="canvas-host" key={`${selectedBoard}:${currentRevision}`}>
      <Excalidraw
        excalidrawAPI={(api) => { excalidrawApiRef.current = api; }}
        initialData={{
          elements: displayElements,
          appState: current.scene.appState,
          files: current.scene.files,
        }}
        onChange={handleChange}
        viewModeEnabled={diffMode.active}
      />
    </div>
  );
}
