import type { Question } from './types';

export const DEFAULT_QUESTIONS: Question[] = [
  { id: 'overall', type: 'rating', label: 'Overall, how was the programme?', required: true },
  { id: 'useful', type: 'rating', label: 'How useful was the content for your work?', required: true },
  { id: 'organised', type: 'rating', label: 'How well was it organised?', required: true },
  { id: 'liked', type: 'text', label: 'What did you like most?' },
  { id: 'improve', type: 'text', label: 'What should we do better next time?' },
  { id: 'recommend', type: 'choice', label: 'Would you recommend this to a colleague?', options: ['Yes', 'Maybe', 'No'], required: true },
];
