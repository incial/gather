import { AlignLeft, BarChart3, Cloud, Gauge, ListOrdered, MessagesSquare, SlidersHorizontal, ThumbsUp, Trophy, Type } from 'lucide-react';
import type { SlideType } from '../../lib/pulse/types';

const MAP = { mc: BarChart3, wordcloud: Cloud, open: AlignLeft, yesno: ThumbsUp, rating: Gauge, opinion: SlidersHorizontal, ranking: ListOrdered, qa: MessagesSquare, quiz: Trophy, content: Type };

export function TypeIcon({ type, size = 18 }: { type: SlideType; size?: number }) {
  const C = MAP[type];
  return <C size={size} aria-hidden="true" />;
}
