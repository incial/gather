import { api, BadRequest, isId } from '@/lib/server/api';
import { pulseAnswerCounts } from '@/lib/server/summaries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/pulse/answer-counts';

export async function GET(req: Request) {
  return api(req, ROUTE, async ({ token, url }) => {
    // items=<id>:s for a survey (counts submissions), <id>:p for a presentation (counts responses).
    const raw = (url.searchParams.get('items') ?? '').split(',').filter(Boolean);
    if (raw.length > 200) throw new BadRequest('too many');
    const ids: string[] = []; const surveys = new Set<string>();
    for (const item of raw) {
      const [id, kind] = item.split(':');
      if (!isId(id) || (kind !== 's' && kind !== 'p')) throw new BadRequest('bad item');
      ids.push(id); if (kind === 's') surveys.add(id);
    }
    return pulseAnswerCounts(token, ids, surveys);
  });
}
