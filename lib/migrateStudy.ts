import { Series, Service } from '../types';

// The study method changed from "Read it · Sit in it · Live it" to S.T.A.R.S. Saved series and lessons
// are updated once on load. Anything the leader rewrote is left alone: only the old wording is replaced.

const OLD_TITLE = /^\s*read it\s*[·•|-]\s*sit in it\s*[·•|-]\s*live it\s*$/i;
const OLD_INSTRUCTIONS = /^Walk through the passage together with the same three moves every week\./;
const OLD_SCRIPT = /read it:[\s\S]*sit in it:[\s\S]*live it:/i;
const OLD_LETTER = 'Each week also uses the same study method: Read it, Sit in it, Live it.';
const OLD_SAFETY = "If a student shares abuse, self-harm, or that they are not safe, follow the church's safety policy and tell the youth pastor the same day. Never promise to keep it secret.";

const INSTRUCTIONS = 'Walk through the passage with the S.T.A.R.S. prompts below. Take a few answers for each letter, then ask the questions. There are no wrong answers.';
const questions = (standout: string) =>
  [
    'What do you hear God saying to you through this passage?',
    standout,
    'What was surprising about this passage?',
    'What feelings or emotions stirred in you in response to this passage?',
  ].map((q, i) => `${i + 1}. ${q}`).join('\n');

// The built-in B.L.E.S.S. lessons get a question about their own passage; anything else, a general one.
const standoutFor = (service: Service) =>
  ({
    'begin with prayer': 'What stood out to you about how Paul prays for people he has never met?',
    'listen with care': 'What stood out to you about how Philip listened: to the Spirit, to the man, and to the Scriptures?',
    'eat together': 'What stood out to you about who Jesus chose to eat with, and who complained about it?',
    'serve with love': 'What stood out to you about who Jesus says he is in this story?',
    'share the story': 'What stood out to you about how Jesus spoke to the Samaritan woman?',
  } as Record<string, string>)[service.title.trim().toLowerCase()] ?? 'What stood out to you most in this passage?';

export const migrateStudyServices = (services: Service[]): Service[] =>
  services.map((service) => {
    let changed = false;
    const sections = service.sections.map((section) => ({
      ...section,
      parts: section.parts.map((part) => {
        if (!OLD_TITLE.test(part.title)) return part;
        changed = true;
        return {
          ...part,
          title: 'S.T.A.R.S.',
          instructions: OLD_INSTRUCTIONS.test(part.instructions.trim()) ? INSTRUCTIONS : part.instructions,
          script: OLD_SCRIPT.test(part.script) ? questions(standoutFor(service)) : part.script,
        };
      }),
    }));
    return changed ? { ...service, sections } : service;
  });

export const migrateStudySeries = (series: Series[]): Series[] =>
  series.map((s) => {
    if (!s.leaderGuide.includes(OLD_LETTER) && !s.leaderGuide.includes(OLD_SAFETY)) return s;
    const leaderGuide = s.leaderGuide
      .replace(OLD_LETTER, 'Each week also studies the passage the same way, with the S.T.A.R.S. method: Something familiar, Themes, Attributes of God, Repetition, Something surprising.')
      .replace(new RegExp(`\\s*${OLD_SAFETY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '')
      .trim();
    return { ...s, leaderGuide };
  });
