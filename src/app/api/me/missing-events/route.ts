import { api, idList } from '@/lib/server/api';
import { missingEvents } from '@/lib/server/summaries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/me/missing-events';

export async function GET(req: Request) {
  return api(req, ROUTE, async ({ token, url }) => {
    return missingEvents(token, idList(url, 'ids', 300));
  });
}
