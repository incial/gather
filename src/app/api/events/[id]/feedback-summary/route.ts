import { FsError } from '@/lib/server/firestore';
import { api, BadRequest, idList, isId } from '@/lib/server/api';
import { feedbackSummary } from '@/lib/server/summaries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/events/[id]/feedback-summary';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return api(req, ROUTE, async ({ token, url }) => {
    if (!isId(id)) throw new BadRequest('bad id');
    const r = await feedbackSummary(token, id, idList(url, 'sessions'), idList(url, 'speakers'));
    if (!r) throw new FsError(404, 'not found');
    return r;
  });
}
