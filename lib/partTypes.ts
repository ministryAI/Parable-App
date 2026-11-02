import {
  BookOpen, Dices, HandHeart, Layers, LucideIcon, Megaphone, MessageSquare, MessagesSquare, Music, PlayCircle, Puzzle, Quote, Scissors,
} from 'lucide-react';
import { PartType } from '../types';

export const PART_TYPES: Record<PartType, { label: string; icon: LucideIcon; tone: string }> = {
  script: { label: 'Script', icon: MessageSquare, tone: 'bg-sky-100 text-sky-800' },
  'bible-story': { label: 'Bible Story', icon: BookOpen, tone: 'bg-amber-100 text-amber-800' },
  'bible-verse': { label: 'Bible Verse', icon: Quote, tone: 'bg-yellow-100 text-yellow-800' },
  worship: { label: 'Worship Song', icon: Music, tone: 'bg-violet-100 text-violet-800' },
  video: { label: 'Video', icon: PlayCircle, tone: 'bg-rose-100 text-rose-800' },
  game: { label: 'Game', icon: Dices, tone: 'bg-orange-100 text-orange-800' },
  'group-activity': { label: 'Group Activity', icon: Puzzle, tone: 'bg-emerald-100 text-emerald-800' },
  discussion: { label: 'Discussion', icon: MessagesSquare, tone: 'bg-teal-100 text-teal-800' },
  prayer: { label: 'Prayer', icon: HandHeart, tone: 'bg-indigo-100 text-indigo-800' },
  craft: { label: 'Craft', icon: Scissors, tone: 'bg-pink-100 text-pink-800' },
  announcement: { label: 'Announcement', icon: Megaphone, tone: 'bg-slate-200 text-slate-800' },
  other: { label: 'Other', icon: Layers, tone: 'bg-gray-100 text-gray-700' },
};

export const PART_TYPE_KEYS = Object.keys(PART_TYPES) as PartType[];
