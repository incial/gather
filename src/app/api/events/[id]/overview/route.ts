import { api, BadRequest, isId } from '@/lib/server/api';
import { eventOverview } from '@/lib/server/summaries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/events/[id]/overview';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return api(req, ROUTE, async ({ token }) => {
    if (!isId(id)) throw new BadRequest('bad id');
    return eventOverview(token, id);
  });
}
