import { api, BadRequest, idList, isId } from '@/lib/server/api';
import { sessionAttendance } from '@/lib/server/summaries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/events/[id]/attendance-counts';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return api(req, ROUTE, async ({ token, url }) => {
    if (!isId(id)) throw new BadRequest('bad id');
    return sessionAttendance(token, id, idList(url, 'sessions'));
  });
}
