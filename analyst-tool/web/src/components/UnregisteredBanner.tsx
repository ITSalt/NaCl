import { useState } from 'react';
import { useStore } from '../state/store.js';

// Session-only memo — dismissed banners won't be shown until page reload
const dismissedBanners = new Set<string>();

export default function UnregisteredBanner() {
  const activeProjectId = useStore((s) => s.activeProjectId);
  const unregisteredCwdProjectId = useStore((s) => s.unregisteredCwdProjectId);

  // Track dismiss state in component so it re-renders on close
  const [dismissed, setDismissed] = useState(false);

  const shouldShow =
    activeProjectId === null &&
    unregisteredCwdProjectId !== null &&
    !dismissed &&
    !dismissedBanners.has(unregisteredCwdProjectId);

  if (!shouldShow || !unregisteredCwdProjectId) return null;

  function handleDismiss() {
    if (unregisteredCwdProjectId) {
      dismissedBanners.add(unregisteredCwdProjectId);
    }
    setDismissed(true);
  }

  return (
    <div className="unregistered-banner" role="alert">
      <span className="unregistered-banner-icon">⚠</span>
      <span className="unregistered-banner-text">
        Unregistered project:{' '}
        <code className="unregistered-banner-id">{unregisteredCwdProjectId}</code>.{' '}
        Run <code>/nacl-init</code> in this directory to register it.
      </span>
      <button
        className="unregistered-banner-close"
        onClick={handleDismiss}
        title="Dismiss for this session"
        aria-label="Dismiss banner"
      >
        ✕
      </button>
    </div>
  );
}
