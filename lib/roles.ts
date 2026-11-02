import { FamilyCues, Part, Section, Series, Service } from '../types';
import { listItems, stripCues } from './text';
import { visibleParts } from './time';

export const ROLE_LABELS: Record<Section['role'], string> = {
  large: 'Large group',
  small: 'Small group',
  other: 'Other',
};

const shown = (service: Service) => service.sections.filter((s) => !s.hidden && visibleParts(s).length > 0);

export const sectionsFor = (service: Service, roles: Section['role'][]) => shown(service).filter((s) => roles.includes(s.role));

const isIcebreaker = (p: Part) => /ice.?breaker|warm.?up|get(ting)? to know/i.test(p.title);
// A weekly challenge is something said to the group, not a game with "challenge" in its name.
export const isChallenge = (p: Part) =>
  !['game', 'group-activity', 'craft'].includes(p.type) && /challenge|this week|take.?home|try it|apply/i.test(p.title) && !!(p.script.trim() || p.instructions.trim());
const text = (p?: Part) => (p ? stripCues(p.script.trim() || p.instructions.trim()) : '');

// Everything a small group leader needs, pulled out of the small group sections.
export const smallGroupGuide = (service: Service) => {
  const parts = sectionsFor(service, ['small']).flatMap(visibleParts);
  const icebreaker = parts.find(isIcebreaker);
  const prayer = parts.find((p) => p.type === 'prayer' && text(p));
  const discussion = parts.filter((p) => p.type === 'discussion' && p !== icebreaker && p.script.trim());
  const challenge = parts.find(isChallenge) ?? shown(service).flatMap(visibleParts).find(isChallenge);
  const used = new Set([icebreaker, prayer, challenge, ...discussion].filter(Boolean));
  const activities = parts.filter((p) => !used.has(p) && (p.instructions.trim() || p.script.trim() || p.supplies.length));
  return {
    has: parts.length > 0,
    icebreaker: text(icebreaker),
    prayer: text(prayer),
    questions: discussion.flatMap((p) => listItems(p.script)),
    notes: discussion.map((p) => p.leaderNotes.trim()).filter(Boolean).join('\n'),
    activities,
    challenge: text(challenge),
  };
};

// Games and activities from the whole service, for the lesson's "Engagement" box.
export const engagement = (service: Service) => {
  const all = shown(service).flatMap(visibleParts);
  return {
    activities: all.filter((p) => ['game', 'group-activity', 'craft'].includes(p.type) && !isIcebreaker(p)),
    challenge: text(all.find(isChallenge)),
  };
};

// The leader's family cues, with sensible fallbacks from the lesson so the page is never empty.
export const familyCues = (service: Service, series?: Series): FamilyCues => {
  const guide = smallGroupGuide(service);
  const verse = service.keyVerse || series?.memoryVerse;
  const f = service.family;
  return {
    morning: f.morning.trim() || (verse ? `Start the day with this week's verse: ${verse}` : service.bigIdea ? `Remind them over breakfast: ${service.bigIdea}` : ''),
    onTheGo: f.onTheGo.trim() || (guide.challenge ? `This week's challenge: ${guide.challenge}` : service.title ? `Ask what they remember about "${service.title}."` : ''),
    meal: f.meal.trim() || (guide.questions[0] ? `Ask at dinner: ${guide.questions[0]}` : ''),
    bedtime: f.bedtime.trim() || (service.bigIdea ? `Pray together, thanking God that ${service.bigIdea.charAt(0).toLowerCase()}${service.bigIdea.slice(1)}` : guide.prayer),
  };
};

export const FAMILY_LABELS: Record<keyof FamilyCues, { title: string; hint: string }> = {
  morning: { title: 'Wake-up', hint: 'A verse or truth to start the day' },
  onTheGo: { title: 'On the go', hint: 'Something to do or notice in the car or out and about' },
  meal: { title: 'Around the table', hint: 'A question to ask at a meal' },
  bedtime: { title: 'Lights out', hint: 'A prayer or blessing at bedtime' },
};
