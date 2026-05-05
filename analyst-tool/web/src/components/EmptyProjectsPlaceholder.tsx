export default function EmptyProjectsPlaceholder() {
  return (
    <div className="empty-projects-placeholder">
      <div className="empty-projects-icon">📂</div>
      <p className="empty-projects-heading">No projects yet.</p>
      <p className="empty-projects-hint">
        Run <code>/nacl-init</code> in a project directory to get started.
      </p>
      <a
        className="empty-projects-link"
        href="https://github.com/your-org/NaCl/blob/main/docs/analyst-tool.md"
        target="_blank"
        rel="noopener noreferrer"
      >
        View documentation →
      </a>
    </div>
  );
}
