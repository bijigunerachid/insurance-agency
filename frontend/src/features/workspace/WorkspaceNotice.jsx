import { FunnelIcon } from '@heroicons/react/20/solid';
import { fr } from '../../i18n/fr.js';
import { BOTH, useWorkspace } from './Workspace.jsx';

const t = fr.workspace;

/**
 * On a list filtered by the workspace: which insurer it shows, and a way to see both. `text`
 * says it otherwise (clients and vehicles: also those without any contract).
 */
export function WorkspaceNotice({ text = t.notice }) {
  const { insurer, choose } = useWorkspace();
  if (!insurer) return null;
  return (
    <div
      role="status"
      style={{ '--brand': insurer.colour ?? '#334155' }}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-line border-l-4 border-l-(--brand) bg-surface px-4 py-2.5 text-sm text-ink-soft shadow-hairline"
    >
      <FunnelIcon aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
      <span className="min-w-0 flex-1">{text(insurer.code)}</span>
      <button
        type="button"
        onClick={() => choose(BOTH)}
        className="focus-ring rounded-control font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
      >
        {t.showBoth}
      </button>
    </div>
  );
}
