import { PartType, Section } from '../types';
import { newPart, newSection } from './factory';

type Skeleton = { title: string; parts: [string, PartType, number][] }[];

export interface ServiceTemplate {
  id: string;
  name: string;
  description: string;
  sections: Skeleton;
}

export const TEMPLATES: ServiceTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start from nothing and add your own sections.',
    sections: [],
  },
  {
    id: 'students',
    name: 'Student Lesson',
    description: 'Opening, Scripture, Teaching, Application, and Small Groups, the same shape as B.L.E.S.S. About 70 minutes.',
    sections: [
      { title: 'Opening', parts: [['Welcome', 'script', 4], ['Illustration', 'script', 6], ['Transition', 'prayer', 2]] },
      { title: 'Scripture', parts: [['Background', 'script', 3], ['Read: Passage', 'bible-verse', 4], ['Read It · Sit In It · Live It', 'discussion', 6]] },
      { title: 'Teaching', parts: [['Point 1: ', 'script', 5], ['Point 2: ', 'script', 5], ['Point 3: ', 'script', 5]] },
      { title: 'Application', parts: [['Practice', 'prayer', 3], ['Weekly Challenge', 'script', 3]] },
      { title: 'Small Groups', parts: [['Icebreaker', 'discussion', 3], ['Discussion', 'discussion', 12], ['Prayer', 'prayer', 5]] },
    ],
  },
  {
    id: 'kids',
    name: 'Kids Service',
    description: 'Social, worship, Bible story, and small groups. About 90 minutes.',
    sections: [
      { title: 'Social', parts: [['Welcome Game', 'game', 10], ['Welcome & Big Idea', 'script', 5]] },
      { title: 'Worship', parts: [['Worship Opener', 'script', 3], ['Song 1', 'worship', 4], ['Song 2', 'worship', 4], ['Memory Verse', 'bible-verse', 5]] },
      { title: 'Bible Story', parts: [['Intro Sketch', 'script', 5], ['Bible Story', 'bible-story', 15], ['Prayer', 'prayer', 3]] },
      { title: 'Small Groups', parts: [['Icebreaker', 'discussion', 5], ['Group Activity', 'group-activity', 10], ['Discussion', 'discussion', 10], ['Prayer Focus', 'prayer', 5]] },
    ],
  },
  {
    id: 'youth',
    name: 'Youth Night',
    description: 'Hangout, worship, message, and discussion groups. About 90 minutes.',
    sections: [
      { title: 'Hangout', parts: [['Game', 'game', 15], ['Announcements', 'announcement', 5]] },
      { title: 'Worship', parts: [['Worship Set', 'worship', 20]] },
      { title: 'Message', parts: [['Hook', 'script', 5], ['Teaching', 'bible-story', 20], ['Response', 'prayer', 5]] },
      { title: 'Small Groups', parts: [['Icebreaker', 'discussion', 5], ['Discussion', 'discussion', 15], ['Prayer Focus', 'prayer', 5], ['Weekly Challenge', 'script', 5]] },
    ],
  },
  {
    id: 'preschool',
    name: 'Preschool',
    description: 'Play, circle time, story, and activity stations for ages 3–5.',
    sections: [
      { title: 'Arrival', parts: [['Free Play', 'game', 10]] },
      { title: 'Circle Time', parts: [['Welcome Song', 'worship', 3], ['Memory Verse', 'bible-verse', 5]] },
      { title: 'Bible Story', parts: [['Bible Story', 'bible-story', 10], ['Prayer', 'prayer', 2]] },
      { title: 'Activity Stations', parts: [['Craft', 'craft', 10], ['Movement Game', 'game', 10], ['Snack & Talk', 'discussion', 10]] },
    ],
  },
];

export const sectionsFromTemplate = (template: ServiceTemplate): Section[] =>
  template.sections.map((s) =>
    newSection({ title: s.title, parts: s.parts.map(([title, type, minutes]) => newPart({ title, type, minutes })) }),
  );
