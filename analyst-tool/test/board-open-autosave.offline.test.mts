import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = join(import.meta.dirname, '..');
const scene = (version = 1) => ({
  type: 'excalidraw',
  version: 2,
  elements: [{ id: 'step', x: version, version, versionNonce: version * 10, updated: 100 + version }],
  appState: { viewBackgroundColor: '#ffffff', gridSize: null },
  files: {},
});

// Exercise the real CanvasHost callback with controlled React hooks. In a
// browser, a child can call onChange before the parent's passive effects run.
async function canvasHarness() {
  const modules = {
    'react': `export const useCallback = (fn) => fn;
      export const useMemo = (fn) => fn();
      export const useRef = (value) => globalThis.__canvasHooks.ref(value);
      export const useState = (value) => globalThis.__canvasHooks.state(value);
      export const useEffect = (fn) => globalThis.__canvasHooks.effects.push(fn);`,
    'react/jsx-runtime': `export const jsx = (type, props, key) => ({type, props, key});
      export const jsxs = jsx; export const Fragment = 'fragment';`,
    '@excalidraw/excalidraw': `export const Excalidraw = 'mock-excalidraw';`,
    'store': `export const useStore = (pick) => pick(globalThis.__canvasStore);
      useStore.getState = () => globalThis.__canvasStore;`,
    'banner': `export const BoardChangedBanner = 'mock-banner';`,
  };
  const output = await build({
    entryPoints: [join(root, 'web/src/components/CanvasHost.tsx')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    plugins: [{
      name: 'offline-component-boundary',
      setup(plugin) {
        plugin.onResolve({ filter: /^react(?:\/jsx-runtime)?$|^@excalidraw\/excalidraw$|\/state\/store\.js$|\/BoardChangedBanner\.js$/ }, ({ path }) => ({
          path: path.endsWith('/state/store.js') ? 'store' : path.endsWith('/BoardChangedBanner.js') ? 'banner' : path,
          namespace: 'offline-mock',
        }));
        plugin.onLoad({ filter: /.*/, namespace: 'offline-mock' }, ({ path }) => ({
          contents: modules[path as keyof typeof modules],
          loader: 'js',
        }));
      },
    }],
  });
  const encoded = Buffer.from(output.outputFiles[0]!.text).toString('base64');
  const { default: CanvasHost } = await import(`data:text/javascript;base64,${encoded}`);
  return CanvasHost as () => { type: string; props: Record<string, unknown> };
}

function findCanvas(node: unknown): { props: Record<string, unknown> } {
  if (node && typeof node === 'object') {
    const value = node as { type?: string; props?: Record<string, unknown> };
    if (value.type === 'mock-excalidraw') return value as { props: Record<string, unknown> };
    const children = value.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child) {
        try { return findCanvas(child); } catch { /* search next child */ }
      }
    }
  }
  throw new Error('Excalidraw callback missing');
}

function fakeHooks() {
  let cursor = 0;
  const slots: unknown[] = [];
  return {
    effects: [] as Array<() => void | (() => void)>,
    reset() { cursor = 0; this.effects = []; },
    ref(value: unknown) {
      const index = cursor++;
      slots[index] ??= { current: value };
      return slots[index];
    },
    state(value: unknown) {
      const index = cursor++;
      slots[index] ??= { value };
      const slot = slots[index] as { value: unknown };
      return [slot.value, (next: unknown) => { slot.value = next; }];
    },
  };
}

test('transient mount metadata then settled scene cannot save without an edit', async (t) => {
  const CanvasHost = await canvasHarness();
  const hooks = fakeHooks();
  const writes: unknown[] = [];
  const pending = new Map<number, () => void>();
  let timer = 0;
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  globalThis.setTimeout = ((callback: () => void) => {
    pending.set(++timer, callback);
    return timer;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => { pending.delete(id); }) as typeof clearTimeout;
  const loaded = scene(1);
  const transient = {
    ...loaded,
    elements: loaded.elements.map((element) => ({
      ...element, version: 2, versionNonce: 20, updated: 102,
    })),
  };
  (globalThis as Record<string, unknown>).__canvasHooks = hooks;
  (globalThis as Record<string, unknown>).__canvasStore = {
    selectedBoard: 'A', current: { scene: loaded }, currentRevision: 1, reloadKey: 0,
    diffMode: { active: false, entries: [] }, pendingHighlightElementId: null,
    clearPendingHighlight() {}, saveCurrent(value: unknown) { writes.push(value); },
  };
  try {
    hooks.reset();
    const onChange = findCanvas(CanvasHost()).props.onChange as (...args: unknown[]) => void;
    const trace: Array<{ callback: string; version: number; x: number; pending: number; writes: number }> = [];
    const record = (callback: string, value: ReturnType<typeof scene>) => {
      onChange(value.elements, value.appState, value.files);
      trace.push({
        callback, version: value.elements[0]!.version, x: value.elements[0]!.x,
        pending: pending.size, writes: writes.length,
      });
    };
    record('mount-metadata', transient);
    record('settled-loaded-scene', loaded);
    for (const [id, run] of [...pending]) { pending.delete(id); run(); }
    trace.push({ callback: 'debounce-flush', version: 1, x: 1, pending: pending.size, writes: writes.length });
    t.diagnostic(JSON.stringify(trace));
    assert.equal(writes.length, 0, 'settling back to the loaded scene must not send a PUT');

    record('genuine-x-edit', scene(3));
    for (const [id, run] of [...pending]) { pending.delete(id); run(); }
    assert.equal(writes.length, 1, 'a genuine content edit still saves');
    assert.equal((writes[0] as ReturnType<typeof scene>).elements[0]?.x, 3);
  } finally {
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
    delete (globalThis as Record<string, unknown>).__canvasHooks;
    delete (globalThis as Record<string, unknown>).__canvasStore;
  }
});

test('font-refresh geometry callback cannot save while a later user edit still saves', async (t) => {
  const CanvasHost = await canvasHarness();
  const hooks = fakeHooks();
  const writes: unknown[] = [];
  const pending = new Map<number, () => void>();
  let timer = 0;
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  const originalDocument = globalThis.document;
  let loadingDone: (() => void) | null = null;
  globalThis.setTimeout = ((callback: () => void) => {
    pending.set(++timer, callback);
    return timer;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => { pending.delete(id); }) as typeof clearTimeout;
  globalThis.document = { fonts: {
    ready: Promise.resolve(),
    addEventListener(_event: string, listener: () => void) { loadingDone = listener; },
    removeEventListener() {},
  } } as unknown as Document;
  const loaded = {
    ...scene(1),
    elements: [{ ...scene(1).elements[0]!, type: 'text', text: 'Title', width: 100, height: 30, baseline: 20 }],
  };
  const normalized = {
    ...loaded,
    elements: [{ ...loaded.elements[0]!, width: 112, height: 32, baseline: 22,
      version: 2, versionNonce: 20, updated: 102 }],
  };
  (globalThis as Record<string, unknown>).__canvasHooks = hooks;
  (globalThis as Record<string, unknown>).__canvasStore = {
    selectedBoard: 'A', current: { scene: loaded }, currentRevision: 1, reloadKey: 0,
    diffMode: { active: false, entries: [] }, pendingHighlightElementId: null,
    clearPendingHighlight() {}, saveCurrent(value: unknown) { writes.push(value); },
  };
  try {
    hooks.reset();
    const first = findCanvas(CanvasHost());
    const onChange = first.props.onChange as (...args: unknown[]) => void;
    onChange(loaded.elements, loaded.appState, loaded.files);
    const refreshes: unknown[] = [];
    let apiElements = loaded.elements;
    (first.props.excalidrawAPI as (api: unknown) => void)({
      getSceneElements: () => apiElements,
      updateScene: (value: unknown) => { refreshes.push(value); },
    });
    hooks.reset();
    const secondHost = CanvasHost();
    const second = findCanvas(secondHost);
    for (const effect of hooks.effects) effect();
    await Promise.resolve();
    assert.equal(refreshes.length, 1, 'the component initiated one font refresh');
    const secondOnChange = second.props.onChange as (...args: unknown[]) => void;
    secondOnChange(normalized.elements, normalized.appState, normalized.files);
    t.diagnostic(JSON.stringify({ stage: 'font-refresh-callback', pending: pending.size,
      writes: writes.length, originalWidth: 100, normalizedWidth: 112 }));
    for (const [id, run] of [...pending]) { pending.delete(id); run(); }
    assert.equal(writes.length, 0, 'the component font refresh must not send a PUT');

    // Font loading can finish during a pointer resize. The refresh must not
    // mistake the user's geometry change for normalization.
    apiElements = normalized.elements;
    (secondHost.props.onPointerDownCapture as () => void)();
    if (loadingDone) loadingDone();
    const resized = { ...normalized, elements: [{ ...normalized.elements[0]!,
      width: 140, version: 3, versionNonce: 30, updated: 103 }] };
    secondOnChange(resized.elements, resized.appState, resized.files);
    for (const [id, run] of [...pending]) { pending.delete(id); run(); }
    assert.equal(writes.length, 1, 'a genuine pointer resize still saves');
    assert.equal((writes[0] as typeof resized).elements[0]?.width, 140);

    const edited = { ...normalized, elements: [{ ...normalized.elements[0]!, x: 7, text: 'Edited',
      version: 4, versionNonce: 40, updated: 104 }] };
    secondOnChange(edited.elements, edited.appState, edited.files);
    for (const [id, run] of [...pending]) { pending.delete(id); run(); }
    assert.equal(writes.length, 2, 'a subsequent genuine edit still saves');
    assert.equal((writes[1] as typeof edited).elements[0]?.text, 'Edited');
  } finally {
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
    globalThis.document = originalDocument;
    delete (globalThis as Record<string, unknown>).__canvasHooks;
    delete (globalThis as Record<string, unknown>).__canvasStore;
  }
});

test('font refresh before the first mount callback stays read-only', async () => {
  const CanvasHost = await canvasHarness();
  const hooks = fakeHooks();
  const writes: unknown[] = [];
  const pending = new Map<number, () => void>();
  let timer = 0;
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  const originalDocument = globalThis.document;
  globalThis.setTimeout = ((callback: () => void) => {
    pending.set(++timer, callback);
    return timer;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => { pending.delete(id); }) as typeof clearTimeout;
  globalThis.document = { fonts: {
    ready: Promise.resolve(), addEventListener() {}, removeEventListener() {},
  } } as unknown as Document;
  const loaded = { ...scene(1),
    elements: [{ ...scene(1).elements[0]!, type: 'text', text: 'Title',
      width: 100, height: 30, baseline: 20 }] };
  const normalized = { ...loaded,
    elements: [{ ...loaded.elements[0]!, width: 112, height: 32, baseline: 22,
      version: 2, versionNonce: 20, updated: 102 }] };
  (globalThis as Record<string, unknown>).__canvasHooks = hooks;
  (globalThis as Record<string, unknown>).__canvasStore = {
    selectedBoard: 'A', current: { scene: loaded }, currentRevision: 1, reloadKey: 0,
    diffMode: { active: false, entries: [] }, pendingHighlightElementId: null,
    clearPendingHighlight() {}, saveCurrent(value: unknown) { writes.push(value); },
  };
  try {
    hooks.reset();
    const first = findCanvas(CanvasHost());
    (first.props.excalidrawAPI as (api: unknown) => void)({
      getSceneElements: () => loaded.elements, updateScene() {},
    });
    hooks.reset();
    const second = findCanvas(CanvasHost());
    for (const effect of hooks.effects) effect();
    await Promise.resolve();
    const onChange = second.props.onChange as (...args: unknown[]) => void;
    onChange(normalized.elements, normalized.appState, normalized.files);
    for (const [id, run] of [...pending]) { pending.delete(id); run(); }
    assert.equal(writes.length, 0, 'a font refresh can precede the child mount callback');
  } finally {
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
    globalThis.document = originalDocument;
    delete (globalThis as Record<string, unknown>).__canvasHooks;
    delete (globalThis as Record<string, unknown>).__canvasStore;
  }
});

test('opening a board cannot debounce an unchanged scene before passive effects', async () => {
  const CanvasHost = await canvasHarness();
  const hooks = fakeHooks();
  const writes: unknown[] = [];
  const pending = new Map<number, () => void>();
  const flushTimers = () => {
    for (const [id, run] of [...pending]) {
      pending.delete(id);
      run();
    }
  };
  let timer = 0;
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  globalThis.setTimeout = ((callback: () => void) => {
    pending.set(++timer, callback);
    return timer;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => { pending.delete(id); }) as typeof clearTimeout;
  const loaded = scene();
  (globalThis as Record<string, unknown>).__canvasHooks = hooks;
  (globalThis as Record<string, unknown>).__canvasStore = {
    selectedBoard: 'A', current: { scene: loaded }, currentRevision: 1, reloadKey: 0,
    diffMode: { active: false, entries: [] }, pendingHighlightElementId: null,
    clearPendingHighlight() {}, saveCurrent(value: unknown) { writes.push(value); },
  };
  try {
    hooks.reset();
    const canvas = findCanvas(CanvasHost());
    const onChange = canvas.props.onChange as (...args: unknown[]) => void;
    // Excalidraw may also normalize a nullable grid setting on mount.
    onChange(loaded.elements, { ...loaded.appState, gridSize: undefined }, loaded.files);
    for (const effect of hooks.effects) effect();
    flushTimers();
    assert.equal(writes.length, 0, 'board open must not send an automatic PUT');

    onChange(scene(2).elements, loaded.appState, loaded.files);
    (globalThis as Record<string, unknown>).__canvasStore = {
      ...((globalThis as Record<string, unknown>).__canvasStore as Record<string, unknown>),
      selectedBoard: 'B',
    };
    flushTimers();
    assert.equal(writes.length, 0, 'switching boards before debounce prevents the stale write');
    (globalThis as Record<string, unknown>).__canvasStore = {
      ...((globalThis as Record<string, unknown>).__canvasStore as Record<string, unknown>),
      selectedBoard: 'A',
    };
    onChange(scene(3).elements, loaded.appState, loaded.files);
    flushTimers();
    assert.equal(writes.length, 1, 'a real content edit still saves');

    const selected = scene(5);
    (globalThis as Record<string, unknown>).__canvasStore = {
      ...((globalThis as Record<string, unknown>).__canvasStore as Record<string, unknown>),
      selectedBoard: 'B', current: { scene: selected }, currentRevision: 2,
    };
    hooks.reset();
    const boardB = findCanvas(CanvasHost());
    (boardB.props.onChange as (...args: unknown[]) => void)(
      selected.elements, selected.appState, selected.files,
    );
    for (const effect of hooks.effects) effect();
    flushTimers();
    assert.equal(writes.length, 1, 'selecting board B without an edit must not save');
  } finally {
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
    delete (globalThis as Record<string, unknown>).__canvasHooks;
    delete (globalThis as Record<string, unknown>).__canvasStore;
  }
});

test('same-board reload retires the old debounce before it can overwrite the new scene', async () => {
  const CanvasHost = await canvasHarness();
  const hooks = fakeHooks();
  const writes: unknown[] = [];
  const pending = new Map<number, () => void>();
  const flushTimers = () => {
    for (const [id, run] of [...pending]) {
      pending.delete(id);
      run();
    }
  };
  let timer = 0;
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  globalThis.setTimeout = ((callback: () => void) => {
    pending.set(++timer, callback);
    return timer;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => { pending.delete(id); }) as typeof clearTimeout;
  const loaded = scene(1);
  (globalThis as Record<string, unknown>).__canvasHooks = hooks;
  (globalThis as Record<string, unknown>).__canvasStore = {
    selectedBoard: 'A', current: { scene: loaded }, currentRevision: 1, reloadKey: 0,
    diffMode: { active: false, entries: [] }, pendingHighlightElementId: null,
    clearPendingHighlight() {}, saveCurrent(value: unknown) { writes.push(value); },
  };
  const setLoaded = (value: ReturnType<typeof scene>, revision: number, reloadKey: number) => {
    (globalThis as Record<string, unknown>).__canvasStore = {
      ...((globalThis as Record<string, unknown>).__canvasStore as Record<string, unknown>),
      current: { scene: value }, currentRevision: revision, reloadKey,
    };
  };
  const onChange = () => {
    hooks.reset();
    return findCanvas(CanvasHost()).props.onChange as (...args: unknown[]) => void;
  };
  try {
    const first = onChange();
    first(loaded.elements, loaded.appState, loaded.files);
    const oldCleanups = hooks.effects
      .map((effect) => effect())
      .filter((cleanup): cleanup is () => void => typeof cleanup === 'function');
    first(scene(2).elements, loaded.appState, loaded.files);
    assert.equal(pending.size, 1, 'the old scene has a pending edit');

    const restored = scene(4);
    setLoaded(restored, 2, 1);
    const second = onChange();
    second(restored.elements, restored.appState, restored.files);
    assert.equal(pending.size, 0, 'same-board load must cancel the old edit');
    flushTimers();
    assert.equal(writes.length, 0, 'the restored scene must not receive a stale PUT');

    second(scene(5).elements, restored.appState, restored.files);
    for (const cleanup of oldCleanups) cleanup();
    assert.equal(pending.size, 1, 'old passive cleanup must not cancel the new scene edit');
    flushTimers();
    assert.equal(writes.length, 1, 'a genuine edit of the new scene still saves');
    assert.equal((writes[0] as ReturnType<typeof scene>).elements[0]?.version, 5);

    second(scene(6).elements, restored.appState, restored.files);
    setLoaded(scene(7), 3, 2);
    flushTimers();
    assert.equal(writes.length, 1, 'the callback also rejects a changed load before rerender');
  } finally {
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
    delete (globalThis as Record<string, unknown>).__canvasHooks;
    delete (globalThis as Record<string, unknown>).__canvasStore;
  }
});

test('an in-flight save for A cannot replace the newly selected board B', async () => {
  (globalThis as Record<string, unknown>).window = { location: { host: 'invalid.local' } };
  const { useStore } = await import(pathToFileURL(join(root, 'web/src/state/store.ts')).href);
  const { apiClient } = await import(pathToFileURL(join(root, 'web/src/api/client.ts')).href);
  const originalPut = apiClient.putBoard;
  const originalGet = apiClient.getBoard;
  let resolvePut!: (value: { mtime: string; hasUnsyncedEdits: boolean }) => void;
  const put = new Promise<{ mtime: string; hasUnsyncedEdits: boolean }>((resolve) => { resolvePut = resolve; });
  apiClient.putBoard = async () => put;
  apiClient.getBoard = async (name: string) => ({ scene: scene(name === 'A' ? 1 : 2), mtime: name, meta: {} as never });
  const original = useStore.getState();
  try {
    useStore.setState({
      selectedBoard: 'A', current: { scene: scene(1), mtime: 'old', meta: {} as never },
      currentRevision: 1,
      boards: [{ name: 'A', mtime: 'old', lastSyncedAt: null }, { name: 'B', mtime: 'old', lastSyncedAt: null }] as never,
      loadSnapshots: async () => {},
    });
    const save = useStore.getState().saveCurrent(scene(3));
    await useStore.getState().selectBoard('B');
    assert.equal(useStore.getState().current?.scene.elements[0].version, 2);
    resolvePut({ mtime: 'saved-A', hasUnsyncedEdits: true });
    await save;
    assert.equal(useStore.getState().selectedBoard, 'B');
    assert.equal(useStore.getState().current?.scene.elements[0].version, 2);
    assert.equal(useStore.getState().boards.find((board) => board.name === 'A')?.mtime, 'saved-A');
  } finally {
    apiClient.putBoard = originalPut;
    apiClient.getBoard = originalGet;
    useStore.setState(original, true);
    delete (globalThis as Record<string, unknown>).window;
  }
});

test('restoring a snapshot creates a new loaded-scene baseline', async () => {
  (globalThis as Record<string, unknown>).window = { location: { host: 'invalid.local' } };
  const { useStore } = await import(pathToFileURL(join(root, 'web/src/state/store.ts')).href);
  const { apiClient } = await import(pathToFileURL(join(root, 'web/src/api/client.ts')).href);
  const originalRestore = apiClient.restoreSnapshot;
  const originalGet = apiClient.getBoard;
  const originalList = apiClient.listSnapshots;
  const original = useStore.getState();
  apiClient.restoreSnapshot = async () => ({ mtime: 'restored', safetyTimestamp: 'safe' });
  apiClient.getBoard = async () => ({ scene: scene(4), mtime: 'restored', meta: {} as never });
  apiClient.listSnapshots = async () => [];
  try {
    useStore.setState({
      selectedBoard: 'A', current: { scene: scene(1), mtime: 'old', meta: {} as never },
      currentRevision: 1, reloadKey: 0,
    });
    await useStore.getState().restoreSnapshot('A', 'snapshot-1');
    assert.equal(useStore.getState().current?.scene.elements[0].version, 4);
    assert.equal(useStore.getState().currentRevision, 2);
    assert.equal(useStore.getState().reloadKey, 1);
  } finally {
    apiClient.restoreSnapshot = originalRestore;
    apiClient.getBoard = originalGet;
    apiClient.listSnapshots = originalList;
    useStore.setState(original, true);
    delete (globalThis as Record<string, unknown>).window;
  }
});
