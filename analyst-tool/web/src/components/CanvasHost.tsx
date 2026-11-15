import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types';
import type { AppState } from '@excalidraw/excalidraw/types/types';
import type { BinaryFiles } from '@excalidraw/excalidraw/types/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types';
import { useStore } from '../state/store.js';
import type { DiffEntry } from '../state/store.js';
import { BoardChangedBanner } from './BoardChangedBanner.js';

const DEBOUNCE_MS = 800;
const HIGHLIGHT_DURATION_MS = 3000;

// Excalidraw can advance element versions while settling a loaded scene.
// Compare actual scene content before treating such a callback as an edit.
function sceneContentSignature(
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
  ignoreTextMetrics = false,
): string {
  const excluded = new Set(['version', 'versionNonce', 'updated']);
  const elemSig = elements.map((element) => {
    const record = element as unknown as Record<string, unknown>;
    return Object.keys(record)
      .filter((key) => !excluded.has(key)
        && !(ignoreTextMetrics && record['type'] === 'text'
          && (key === 'width' || key === 'height' || key === 'baseline')))
      .sort()
      .map((key) => [key, record[key]]);
  });
  return JSON.stringify({
    e: elemSig,
    bg: appState.viewBackgroundColor ?? '#ffffff',
    grid: appState.gridSize ?? null,
    files: Object.keys(files).sort(),
  });
}

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
  const reloadKey = useStore((s) => s.reloadKey);
  const saveCurrent = useStore((s) => s.saveCurrent);
  const diffMode = useStore((s) => s.diffMode);
  const pendingHighlightElementId = useStore((s) => s.pendingHighlightElementId);
  const clearPendingHighlight = useStore((s) => s.clearPendingHighlight);

  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  // Flipped once Excalidraw hands us its imperative API, so font-refresh effect
  // can depend on API availability instead of racing the mount callback.
  const [apiReady, setApiReady] = useState(false);

  // Transient highlight — element id currently being highlighted (yellow box, ~3s)
  const [highlightElementId, setHighlightElementId] = useState<string | null>(null);

  // Excalidraw fires onChange on every interaction (hover, selection, cursor
  // blink) — not only on actual scene mutations. Without a content-equality
  // guard the debounce keeps firing PUTs every DEBOUNCE_MS even when the
  // scene is unchanged. Hash the structural fields and bail when they match
  // the loaded scene or the last PUT we sent.
  const lastSavedHashRef = useRef<string | null>(null);
  const lastSavedContentRef = useRef<string | null>(null);
  const lastSavedContextRef = useRef<string | null>(null);
  const fontRefreshRef = useRef<{ context: string; content: string } | null>(null);
  const userGestureRef = useRef({ pointer: false, key: false });

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
        bg: appState.viewBackgroundColor ?? '#ffffff',
        grid: appState.gridSize ?? null,
        files: Object.keys(files).sort(),
      });
    },
    [],
  );

  // Owned debounce timer for the loaded board/revision/reload context. A
  // same-board restore must retire the old edit just like a board switch.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerContextRef = useRef<string | null>(null);

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      // A child may call onChange before this parent's passive effects run.
      // Establish the loaded board's baseline synchronously on the first
      // callback for this board/revision, without suppressing a real first edit.
      // A PUT response changes `current` but not this load key, so it cannot
      // reset the baseline while a newer edit is waiting to be saved.
      const contextKey = JSON.stringify([selectedBoard, currentRevision, reloadKey]);
      if (contextKey !== lastSavedContextRef.current) {
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
          saveTimerContextRef.current = null;
        }
        lastSavedContextRef.current = contextKey;
        // The font effect can run before the child's first onChange. Keep
        // only a marker already bound to this new load context.
        if (fontRefreshRef.current?.context !== contextKey) fontRefreshRef.current = null;
        if (current) {
          const initialElements = (current.scene.elements ?? []) as ExcalidrawElement[];
          const initialAppState = (current.scene.appState ?? {}) as AppState;
          const initialFiles = (current.scene.files ?? {}) as BinaryFiles;
          lastSavedHashRef.current = sceneSignature(initialElements, initialAppState, initialFiles);
          lastSavedContentRef.current = sceneContentSignature(initialElements, initialAppState, initialFiles);
        } else {
          lastSavedHashRef.current = null;
          lastSavedContentRef.current = null;
        }
      }
      const sig = sceneSignature(elements, appState, files);
      if (sig === lastSavedHashRef.current) return;
      const content = sceneContentSignature(elements, appState, files);
      if (content === lastSavedContentRef.current) {
        lastSavedHashRef.current = sig;
        return;
      }
      const fontRefresh = fontRefreshRef.current;
      fontRefreshRef.current = null;
      if (fontRefresh?.context === contextKey && saveTimerRef.current === null
          && sceneContentSignature(elements, appState, files, true) === fontRefresh.content) {
        // Only this component's pending font refresh may alter measured text
        // geometry without representing a user edit.
        lastSavedHashRef.current = sig;
        lastSavedContentRef.current = content;
        return;
      }
      lastSavedHashRef.current = sig;
      lastSavedContentRef.current = content;

      // Capture the complete loaded-scene identity. Check the live store
      // before sending, including when a new child has not rendered yet.
      const targetContext = contextKey;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const snapshotElements = [...elements];
      const snapshotAppState = {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
      };
      const snapshotFiles = files;
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        saveTimerContextRef.current = null;
        const state = useStore.getState();
        if (JSON.stringify([state.selectedBoard, state.currentRevision, state.reloadKey])
            !== targetContext) return;
        const scene = {
          type: 'excalidraw',
          version: 2,
          elements: snapshotElements,
          appState: snapshotAppState,
          files: snapshotFiles,
        };
        void saveCurrent(scene);
      }, DEBOUNCE_MS);
      saveTimerContextRef.current = targetContext;
    },
    [sceneSignature, selectedBoard, currentRevision, reloadKey, current, saveCurrent],
  );

  // Cancel pending saves on every loaded-scene transition or unmount.
  useEffect(() => {
    const effectContext = JSON.stringify([selectedBoard, currentRevision, reloadKey]);
    return () => {
      // Old passive cleanup can follow a new child's first onChange. It must
      // not cancel a timer already owned by the newly loaded scene.
      if (saveTimerRef.current && saveTimerContextRef.current === effectContext) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        saveTimerContextRef.current = null;
      }
    };
  }, [selectedBoard, currentRevision, reloadKey]);

  // A drag or key edit may be in progress when fonts finish loading. In that
  // case the following text geometry belongs to the user, not our refresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const endPointer = () => { userGestureRef.current.pointer = false; };
    const endKey = () => { userGestureRef.current.key = false; };
    const endAll = () => { userGestureRef.current.pointer = false; userGestureRef.current.key = false; };
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);
    window.addEventListener('keyup', endKey);
    window.addEventListener('blur', endAll);
    return () => {
      window.removeEventListener('pointerup', endPointer);
      window.removeEventListener('pointercancel', endPointer);
      window.removeEventListener('keyup', endKey);
      window.removeEventListener('blur', endAll);
    };
  }, []);

  // Force Excalidraw to re-render bound text once web fonts finish loading.
  //
  // Excalidraw measures and caches each element's drawn shape (ShapeCache,
  // keyed by element identity) at first paint. When a board is loaded via
  // initialData before its fonts are ready, container-bound text is cached with
  // fallback metrics and stays INVISIBLE until something invalidates the cache —
  // which is why text only appears after the user toggles a property in the
  // panel. See excalidraw#637 / excalidraw#8228.
  //
  // Fix: after the fonts settle, re-issue the scene with fresh element
  // references (shallow clones). New identities miss the ShapeCache, so every
  // element — including bound text — is re-drawn with the now-loaded font.
  // versionNonce is unchanged, so the onChange content-guard suppresses any
  // phantom save.
  useEffect(() => {
    if (!apiReady || !current) return;
    let cancelled = false;

    const forceFontRerender = () => {
      if (cancelled) return;
      const api = excalidrawApiRef.current;
      if (!api) return;
      const apiElements = api.getSceneElements();
      const context = JSON.stringify([selectedBoard, currentRevision, reloadKey]);
      if (saveTimerContextRef.current !== context
          && !userGestureRef.current.pointer && !userGestureRef.current.key) {
        fontRefreshRef.current = {
          context,
          content: sceneContentSignature(
            apiElements,
            (current.scene.appState ?? {}) as AppState,
            (current.scene.files ?? {}) as BinaryFiles,
            true,
          ),
        };
      }
      const refreshed = apiElements.map((e) => ({ ...e }));
      api.updateScene({ elements: refreshed as unknown as ExcalidrawElement[] });
    };

    const fonts = (document as unknown as { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) {
      void fonts.ready.then(forceFontRerender);
    } else {
      // No FontFaceSet API — re-render on next frame as a best-effort fallback.
      requestAnimationFrame(forceFontRerender);
    }
    // Belt-and-suspenders: fonts.ready may resolve before Excalidraw has even
    // registered its faces (nothing pending yet). Catch the later load too.
    const onLoadingDone = () => forceFontRerender();
    fonts?.addEventListener?.('loadingdone', onLoadingDone);

    return () => {
      cancelled = true;
      fonts?.removeEventListener?.('loadingdone', onLoadingDone);
    };
  }, [apiReady, current, selectedBoard, currentRevision, reloadKey]);

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
    <div
      className="canvas-host"
      style={{ position: 'relative' }}
      onPointerDownCapture={() => { userGestureRef.current.pointer = true; fontRefreshRef.current = null; }}
      onPointerUpCapture={() => { userGestureRef.current.pointer = false; }}
      onPointerCancelCapture={() => { userGestureRef.current.pointer = false; }}
      onKeyDownCapture={() => { userGestureRef.current.key = true; fontRefreshRef.current = null; }}
      onKeyUpCapture={() => { userGestureRef.current.key = false; }}
    >
      <BoardChangedBanner />
      <Excalidraw
        key={`${selectedBoard}:${currentRevision}:${reloadKey}`}
        excalidrawAPI={(api) => { excalidrawApiRef.current = api; setApiReady(true); }}
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
