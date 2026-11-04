import { FunnelIcon } from '@heroicons/react/20/solid';
import { fr } from '../../i18n/fr.js';
import { BOTH, useWorkspace } from './Workspace.jsx';

const t = fr.workspace;

/** On a list filtered by the workspace: which insurer it shows, and a way to see both. */
export function WorkspaceNotice() {
  const { insurer, choose } = useWorkspace();
  if (!insurer) return null;
  return (
    <div
      role="status"
      style={{ '--brand': insurer.colour ?? '#334155' }}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-slate-200 border-l-4 border-l-(--brand) bg-white px-3 py-2 text-sm text-slate-700"
    >
      <FunnelIcon aria-hidden="true" className="size-4 shrink-0 text-slate-500" />
      <span className="min-w-0 flex-1">{t.notice(insurer.code)}</span>
      <button
        type="button"
        onClick={() => choose(BOTH)}
        className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-blue-700"
      >
        {t.showBoth}
      </button>
    </div>
  );
}
