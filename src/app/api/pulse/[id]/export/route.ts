import { FsError } from '@/lib/server/firestore';
import { api, BadRequest, isId } from '@/lib/server/api';
import { pulseExport } from '@/lib/server/summaries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/pulse/[id]/export';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return api(req, ROUTE, async ({ token }) => {
    if (!isId(id)) throw new BadRequest('bad id');
    const r = await pulseExport(token, id);
    if (!r) throw new FsError(404, 'not found');
    return r;
  });
}
