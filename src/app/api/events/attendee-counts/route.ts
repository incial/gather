import { api, idList } from '@/lib/server/api';
import { eventAttendeeCounts } from '@/lib/server/summaries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/events/attendee-counts';

export async function GET(req: Request) {
  return api(req, ROUTE, async ({ token, url }) => {
    return eventAttendeeCounts(token, idList(url, 'ids'));
  });
}
