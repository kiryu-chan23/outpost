// The toast shown after a sync.
import { toast } from '../components/ui.jsx';

export function syncToast(res) {
  if (!res) return;
  const added = res.ids.length;
  if (added) toast(`${added} new game${added === 1 ? '' : 's'} synced${res.analysing ? ' — analysing in the background' : ''}`);
  else if (!res.quiet) {
    const errs = res.results.filter((r) => r.error);
    toast(errs.length === res.results.length && errs.length ? (errs[0].kind === 'blocked' ? 'This copy can’t reach chess.com or Lichess — use the download links on the Data page' : errs[0].error) : 'No new games since the last sync');
  }
}
