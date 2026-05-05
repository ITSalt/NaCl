import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../state/store.js';
import type { ProjectRecord } from '../state/store.js';

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

export default function ProjectPicker() {
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const unregisteredCwdProjectId = useStore((s) => s.unregisteredCwdProjectId);
  const projectSwitching = useStore((s) => s.projectSwitching);
  const switchProject = useStore((s) => s.switchProject);

  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFilterText('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && projects.length > 5 && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, projects.length]);

  const activeProject: ProjectRecord | null =
    projects.find((p) => p.id === activeProjectId) ?? null;

  const isEmpty = projects.length === 0 && !unregisteredCwdProjectId;
  const isCwdOnly = !activeProjectId && !!unregisteredCwdProjectId;
  const isDisabled = isEmpty || isCwdOnly || projectSwitching;

  let label: string;
  if (projectSwitching) {
    label = '⟳ switching…';
  } else if (isEmpty) {
    label = 'No projects';
  } else if (isCwdOnly) {
    label = truncate(`${unregisteredCwdProjectId} (unregistered)`, 32);
  } else if (activeProject) {
    label = truncate(activeProject.name, 24);
  } else {
    label = '— select project —';
  }

  const filtered = filterText
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(filterText.toLowerCase()) ||
          p.id.toLowerCase().includes(filterText.toLowerCase()),
      )
    : projects;

  const handleSelect = useCallback(
    async (id: string) => {
      setOpen(false);
      setFilterText('');
      if (id === activeProjectId) return;
      try {
        await switchProject(id);
      } catch {
        // error already logged in store
      }
    },
    [activeProjectId, switchProject],
  );

  return (
    <div className="project-picker" ref={dropdownRef}>
      <button
        className="project-picker-btn"
        onClick={() => {
          if (!isDisabled) setOpen((v) => !v);
        }}
        disabled={isDisabled}
        title={isCwdOnly ? 'Unregistered project — run /nacl-init to register' : label}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="project-picker-label">{label}</span>
        {!isDisabled && <span className="project-picker-arrow">{open ? '▲' : '▼'}</span>}
      </button>

      {open && (
        <div className="project-picker-dropdown" role="listbox">
          {projects.length > 5 && (
            <div className="project-picker-search">
              <input
                ref={inputRef}
                type="text"
                placeholder="Filter projects…"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="project-picker-search-input"
              />
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="project-picker-empty">No matching projects</div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                className={`project-picker-item${p.id === activeProjectId ? ' project-picker-item--active' : ''}`}
                role="option"
                aria-selected={p.id === activeProjectId}
                onClick={() => void handleSelect(p.id)}
              >
                <span className="project-picker-item-name">{p.name}</span>
                <span className="project-picker-item-id">{p.id}</span>
                <span className="project-picker-item-ago">{formatRelative(p.lastUsed)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
