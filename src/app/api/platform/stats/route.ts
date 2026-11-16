import { api } from '@/lib/server/api';
import { platformStats } from '@/lib/server/summaries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/platform/stats';

export async function GET(req: Request) {
  return api(req, ROUTE, async ({ token }) => {
    return platformStats(token);
  });
}
