import { FsError } from '@/lib/server/firestore';
import { api, BadRequest, isId } from '@/lib/server/api';
import { pulseResults } from '@/lib/server/summaries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/pulse/[id]/results';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return api(req, ROUTE, async ({ token }) => {
    if (!isId(id)) throw new BadRequest('bad id');
    const r = await pulseResults(token, id);
    if (!r) throw new FsError(404, 'not found');
    return r;
  });
}
