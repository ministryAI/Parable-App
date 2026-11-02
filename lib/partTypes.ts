import {
  BookOpen, Dices, HandHeart, Layers, LucideIcon, Megaphone, MessageSquare, MessagesSquare, Music, PlayCircle, Puzzle, Quote, Scissors,
} from 'lucide-react';
import { PartType } from '../types';

export const PART_TYPES: Record<PartType, { label: string; icon: LucideIcon; tone: string }> = {
  script: { label: 'Script', icon: MessageSquare, tone: 'bg-sky-500/10 text-sky-700' },
  'bible-story': { label: 'Bible Story', icon: BookOpen, tone: 'bg-amber-500/10 text-amber-700' },
  'bible-verse': { label: 'Bible Verse', icon: Quote, tone: 'bg-yellow-500/10 text-yellow-700' },
  worship: { label: 'Worship Song', icon: Music, tone: 'bg-violet-500/10 text-violet-700' },
  video: { label: 'Video', icon: PlayCircle, tone: 'bg-rose-500/10 text-rose-700' },
  game: { label: 'Game', icon: Dices, tone: 'bg-orange-500/10 text-orange-700' },
  'group-activity': { label: 'Group Activity', icon: Puzzle, tone: 'bg-emerald-500/10 text-emerald-700' },
  discussion: { label: 'Discussion', icon: MessagesSquare, tone: 'bg-teal-500/10 text-teal-700' },
  prayer: { label: 'Prayer', icon: HandHeart, tone: 'bg-indigo-500/10 text-indigo-700' },
  craft: { label: 'Craft', icon: Scissors, tone: 'bg-pink-500/10 text-pink-700' },
  announcement: { label: 'Announcement', icon: Megaphone, tone: 'bg-slate-500/10 text-slate-700' },
  other: { label: 'Other', icon: Layers, tone: 'bg-gray-500/10 text-gray-700' },
};

export const PART_TYPE_KEYS = Object.keys(PART_TYPES) as PartType[];
