import { api, BadRequest, idList, isId } from '@/lib/server/api';
import { speakerConnections } from '@/lib/server/summaries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/events/[id]/speaker-connections';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return api(req, ROUTE, async ({ token, url }) => {
    if (!isId(id)) throw new BadRequest('bad id');
    return speakerConnections(token, id, idList(url, 'speakers'));
  });
}
