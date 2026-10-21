import { BookDesign, BookDesignPatch, FamilyCues, Part, Section, Series, Service, Supply } from '../types';
import { applyPatch, describeDesign } from '../lib/design';
import { newPart, newSection, newSeries, newService, newSupply } from '../lib/factory';
import { PART_TYPE_KEYS, PART_TYPES } from '../lib/partTypes';
import { playbookChecklist, playbookForDrafting } from '../lib/playbook';
import { AISettings, cleanBaseUrl, serverKind, serverOrigin } from './aiSettings';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

const SYSTEM = "You are an experienced children's and youth ministry curriculum writer. You prioritize literary context, historical background, and Jesus-centered theology, and you write engaging, age-appropriate content that a volunteer leader can read and use directly. Avoid Christian jargon where possible; use fresh language.";

const endpoint = (settings: AISettings, path: string) => `${cleanBaseUrl(settings.baseUrl)}${path}`;

const headers = (settings: AISettings) => {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey) h['Authorization'] = `Bearer ${settings.apiKey}`;
  return h;
};

const unreachable = (settings: AISettings) => {
  const kind = serverKind(settings);
  return new Error(
    kind === 'steward' ? `Could not reach Steward at ${settings.baseUrl}. Is the Steward app running on this laptop?`
    : kind === 'ollama' ? `Could not reach Ollama at ${settings.baseUrl}. Make sure it is running, and that it allows this site (OLLAMA_ORIGINS), or connect through Steward instead.`
    : `Could not reach your AI server at ${settings.baseUrl}. Make sure it is running and allows requests from this site (CORS).`,
  );
};

const send = async (settings: AISettings, url: string, body: object): Promise<Response> => {
  try {
    return await fetch(url, { method: 'POST', headers: headers(settings), body: JSON.stringify(body) });
  } catch {
    throw unreachable(settings);
  }
};

const failed = async (response: Response) => {
  const detail = await response.text().catch(() => '');
  if (response.status === 401 || response.status === 403) return new Error('The AI server refused the request. Check the key in AI settings.');
  return new Error(`AI server returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
};

// Some servers (Steward among them) answer with a stream of "data: {...}" lines even when asked not to stream.
// Read the whole reply as text, then take either one JSON object or the pieces of a stream, joined.
const readReply = async (response: Response): Promise<string | undefined> => {
  const raw = (await response.text()).trim();
  const pick = (j: any): string => j?.choices?.[0]?.message?.content ?? j?.choices?.[0]?.delta?.content ?? j?.choices?.[0]?.text ?? j?.message?.content ?? j?.response ?? '';
  if (!/^(data:|\{[^\n]*\}\s*\n\s*\{)/.test(raw)) {
    try { return pick(JSON.parse(raw)) || undefined; } catch { throw new Error(`The AI server sent a reply Parable couldn't read: ${raw.slice(0, 80)}`); }
  }
  let out = '';
  for (const line of raw.split('\n')) {
    const data = line.replace(/^data:\s*/, '').trim();
    if (!data || data === '[DONE]') continue;
    try { out += pick(JSON.parse(data)); } catch { /* skip keep-alive or partial lines */ }
  }
  return out || undefined;
};

// Qwen 3 thinks out loud unless told not to; the /no_think switch goes at the end of the last user message.
const noThink = (settings: AISettings, messages: ChatMessage[]): ChatMessage[] => {
  if (!/qwen3/i.test(settings.model)) return messages;
  const last = messages.length - 1;
  return messages.map((m, i) => (i === last && m.role === 'user' ? { ...m, content: `${m.content} /no_think` } : m));
};

// images: base64 JPEGs attached to the last user message (for models that can see, like Qwen3-VL).
const chat = async (settings: AISettings, messages: ChatMessage[], json: boolean, images: string[] = []): Promise<string> => {
  const kind = serverKind(settings);
  // Structured output is steadier from a small model with no sampling randomness.
  const temperature = json ? 0 : 0.7;
  let text: string | undefined;

  if (kind === 'ollama') {
    // Ollama's own endpoint can switch thinking off properly, keep the model loaded, and widen the context.
    const url = `${serverOrigin(settings)}/api/chat`;
    const last = messages.length - 1;
    const body = {
      model: settings.model,
      messages: images.length ? messages.map((m, i) => (i === last ? { ...m, images } : m)) : messages,
      stream: false,
      think: false,
      keep_alive: '24h',
      options: { num_ctx: 12288, num_predict: -1, temperature },
      ...(json ? { format: 'json' } : {}),
    };
    let response = await send(settings, url, body);
    // Older Ollama versions don't know "think"; fall back to the prompt switch.
    if (response.status === 400) response = await send(settings, url, { ...body, think: undefined, messages: noThink(settings, messages) });
    if (!response.ok) throw await failed(response);
    text = await readReply(response);
  } else {
    const url = endpoint(settings, '/chat/completions');
    const plain = kind === 'steward' ? messages : noThink(settings, messages);
    const body = {
      model: settings.model,
      // OpenAI-style servers take images as content parts on the last message.
      messages: images.length
        ? plain.map((m, i) => (i === plain.length - 1 ? { role: m.role, content: [{ type: 'text', text: m.content }, ...images.map((b) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b}` } }))] } : m))
        : plain,
      temperature,
      // Long series outlines get cut off at some servers' default reply length.
      max_tokens: 8192,
      stream: false,
      ...(kind === 'steward' ? { use_docs: settings.useDocs } : {}),
    };
    // Ask for JSON mode first; some servers reject response_format, so retry without it.
    let response = await send(settings, url, json ? { ...body, response_format: { type: 'json_object' } } : body);
    if (json && (response.status === 400 || response.status === 422)) response = await send(settings, url, body);
    if (!response.ok) throw await failed(response);
    text = await readReply(response);
  }

  if (!text) throw new Error('No response from the AI server.');
  // Reasoning models (e.g. Qwen 3, DeepSeek-R1) may include their thinking; keep only the answer.
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim();
};

// Walk the JSON as written: escape raw line breaks and tabs inside strings (JSON forbids them), and close
// whatever a reply cut off at the length limit left open, dropping a half-written last entry.
const repairJson = (raw: string): string => {
  let out = '';
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (const c of raw) {
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      else if (c === '\n') { out += '\\n'; continue; }
      else if (c === '\r') continue;
      else if (c === '\t') { out += '\\t'; continue; }
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') stack.pop();
    out += c;
  }
  if (!inString && !stack.length) return out;
  if (inString) out += '"';
  // Trim back to the last complete value, then close the open brackets.
  out = out.replace(/,\s*"[^"]*"\s*:\s*"?[^,{}[\]]*$/, '').replace(/[,:\s]+$/, '');
  return out + stack.reverse().join('');
};

// Small local models wrap JSON in prose or code fences and leave trailing commas; be forgiving.
export const parseJsonLoose = <T>(text: string): T => {
  const tryParse = (from: string, to: string) => {
    const start = text.indexOf(from);
    if (start === -1) return undefined;
    const end = text.lastIndexOf(to);
    const raw = text.slice(start, end > start ? end + 1 : undefined);
    const repaired = repairJson(text.slice(start));
    for (const candidate of [raw, raw.replace(/,\s*([}\]])/g, '$1'), repaired, repaired.replace(/,\s*([}\]])/g, '$1')]) {
      try {
        return JSON.parse(candidate) as unknown;
      } catch {
        // try the next cleanup
      }
    }
    return undefined;
  };
  // Whichever comes first is the outer value: a list of objects starts with "[", not its first "{".
  const obj = text.indexOf('{');
  const arr = text.indexOf('[');
  const listFirst = arr !== -1 && (obj === -1 || arr < obj);
  const found = listFirst ? tryParse('[', ']') ?? tryParse('{', '}') : tryParse('{', '}') ?? tryParse('[', ']');
  if (found === undefined) throw new Error('The AI returned something that wasn\'t valid JSON. Try again.');
  // A bare list where an object was expected: hand it back under a generic key.
  return (Array.isArray(found) ? { items: found } : found) as T;
};

// The leader's Ministry Playbook rides along with every writing request, minus the parts only reviews need.
const system = (settings: AISettings) => {
  const playbook = settings.usePlaybook ? playbookForDrafting(settings.playbook ?? '') : '';
  return playbook ? `${SYSTEM}\n\nFollow the leader's Ministry Playbook below in everything you write.\n\n${playbook}` : SYSTEM;
};

// Structured requests are their own focused call that asks for only the JSON.
const askJson = async <T>(settings: AISettings, messages: ChatMessage[]): Promise<T> => {
  const first = await chat(settings, messages, true);
  try {
    return parseJsonLoose<T>(first);
  } catch {
    // One more try: show the model what it said and ask for only the JSON.
    const second = await chat(settings, [
      ...messages,
      { role: 'user', content: `Your last reply was not valid JSON:\n\n${first.slice(0, 1500)}\n\nReply again with ONLY the JSON object that answers the request: no explanation, no code fence, nothing before "{" or after "}".` },
    ], true);
    try {
      return parseJsonLoose<T>(second);
    } catch {
      const said = (second || first).replace(/\s+/g, ' ').trim().slice(0, 140);
      throw new Error(`The AI didn't answer in the format Parable needs. It said: "${said}${said.length >= 140 ? '…' : ''}"`);
    }
  }
};

const chatJson = <T>(settings: AISettings, prompt: string): Promise<T> =>
  askJson<T>(settings, [
    { role: 'system', content: `${system(settings)}\n\nYou always respond with a single valid JSON object and nothing else.` },
    { role: 'user', content: prompt },
  ]);

const chatText = (settings: AISettings, prompt: string) =>
  chat(settings, [{ role: 'system', content: system(settings) }, { role: 'user', content: prompt }], false);

export const testConnection = async (settings: AISettings): Promise<string> => {
  const kind = serverKind(settings);
  const get = async (url: string) => {
    let response: Response;
    try {
      response = await fetch(url, { headers: headers(settings) });
    } catch {
      throw unreachable(settings);
    }
    if (response.status === 401 || response.status === 403) throw new Error('Connected, but the key was refused. Check the key.');
    if (!response.ok) throw new Error(`Server responded with ${response.status}.`);
    return response.json().catch(() => null);
  };
  const check = (models: string[], extra = '') => {
    if (models.length && !models.some((m) => m === settings.model || m.startsWith(`${settings.model}:`))) {
      return `Connected${extra}, but model "${settings.model}" wasn't listed. Available: ${models.slice(0, 8).join(', ')}`;
    }
    return `Connected${extra}.`;
  };

  if (kind === 'steward') {
    const data = await get(`${serverOrigin(settings)}/health`);
    const models: string[] = Array.isArray(data?.models) ? data.models.map((m: unknown) => (typeof m === 'string' ? m : (m as { name?: string })?.name ?? '')).filter(Boolean) : [];
    const docs = typeof data?.docs === 'number' ? data.docs : typeof data?.documents === 'number' ? data.documents : undefined;
    return check(models, ` to Steward${docs !== undefined ? ` (${docs} documents loaded)` : ''}`);
  }
  if (kind === 'ollama') {
    const data = await get(`${serverOrigin(settings)}/api/tags`);
    return check(Array.isArray(data?.models) ? data.models.map((m: { name: string }) => m.name) : [], ' to Ollama');
  }
  const data = await get(endpoint(settings, '/models'));
  return check(Array.isArray(data?.data) ? data.data.map((m: { id: string }) => m.id) : []);
};

// ---------- Context ----------

// A service plus the series it belongs to, so AI drafts fit the series theme.
export type ServiceWithSeries = Service & { seriesInfo?: Series };

export const describeService = (service: ServiceWithSeries, focusPartId?: string) => {
  const series = service.seriesInfo;
  const lines = [
    `Service: "${service.title}" for ${service.audience}.`,
    series && `Series: "${series.title}"${service.week ? `, week ${service.week}` : ''}.${series.description ? ` ${series.description}` : ''}`,
    series?.bigIdea && `Series theme: ${series.bigIdea}`,
    series?.memoryVerse && `Series memory verse: ${series.memoryVerse}`,
    service.bigIdea && `Big idea: ${service.bigIdea}`,
    service.scripture && `Scripture: ${service.scripture}`,
    service.keyVerse && `Key verse: ${service.keyVerse}`,
    `Class size: about ${service.classSize} kids in ${service.groupCount} groups.`,
    'Run of service:',
    ...service.sections.flatMap((s) => [
      `- ${s.title}`,
      ...s.parts.map((p) => `    - ${p.title} (${PART_TYPES[p.type].label}, ${p.minutes} min)${p.id === focusPartId ? '  <-- the part being written' : ''}`),
    ]),
  ];
  return lines.filter(Boolean).join('\n');
};

// ---------- Part-level helpers ----------

export type TextField = 'script' | 'instructions' | 'inclusionTips' | 'leaderNotes';

const FIELD_ASK: Record<TextField, string> = {
  script: 'Write the word-for-word script the leader reads aloud for this part. Use short paragraphs. Mark any leader actions in [brackets].',
  instructions: 'Write clear step-by-step leader instructions for this part: setup, how to lead it, and how to wrap up. Use a numbered list.',
  inclusionTips: 'Write 3–5 practical tips for adapting this part so kids with different abilities, attention spans, sensory needs, or language levels can fully participate.',
  leaderNotes: 'Write brief prep notes for the leader: what to review beforehand, what to watch for, and how this part connects to the big idea.',
};

// How text should be shaped so it prints well (the lesson layout reads these conventions).
const FORMAT_RULES = [
  'Formatting rules:',
  '- Separate paragraphs with a blank line.',
  '- Inside a script, directions for the leader go in square brackets, e.g. [Hold up the phone.] or [Pause for answers.]',
  '- For a list, put each item on its own line starting with "• ".',
  '- A labeled step keeps its label and colon, e.g. "The setup: Pair students up."',
].join('\n');

export const draftPartText = (settings: AISettings, service: Service, section: Section, part: Part, field: TextField, instruction: string) =>
  chatText(settings, [
    describeService(service, part.id),
    '',
    `You are writing the "${part.title}" part (${PART_TYPES[part.type].label}, ${part.minutes} minutes) in the "${section.title}" section.`,
    part.script && field !== 'script' ? `Its current script is:\n${part.script}` : '',
    part[field] ? `The current text is:\n${part[field]}\n\nRevise or improve it.` : '',
    FIELD_ASK[field],
    instruction && `Additional direction from the leader: ${instruction}`,
    field === 'script' || field === 'instructions' ? FORMAT_RULES : '',
    'Return only the text itself, with no preamble or headings.',
  ].filter(Boolean).join('\n'));

export const suggestSupplies = async (settings: AISettings, service: Service, part: Part): Promise<Supply[]> => {
  const result = await chatJson<{ supplies?: unknown[] }>(settings, [
    describeService(service, part.id),
    '',
    `List the supplies needed for "${part.title}" (${PART_TYPES[part.type].label}).`,
    part.instructions && `Instructions:\n${part.instructions}`,
    part.script && `Script:\n${part.script}`,
    'Respond as {"supplies":[{"name":"...","qty":1,"per":"total"}]}. "per" is "total" (fixed amount), "person" (each kid needs qty), or "group" (each small group needs qty).',
  ].filter(Boolean).join('\n'));
  return (result.supplies ?? []).map((s) => newSupply((s ?? {}) as Partial<Supply>)).filter((s) => s.name);
};

// ---------- Section / service helpers ----------

const PART_SHAPE = `{"title":"...","type":"one of: ${PART_TYPE_KEYS.join(', ')}","minutes":5,"script":"word-for-word leader script","instructions":"numbered steps","supplies":[{"name":"...","qty":1,"per":"total|person|group"}]}`;

// Naming conventions the printed lesson recognizes (numbered points, readings, challenges).
const PART_RULES = [
  'Part conventions:',
  '- A teaching point is its own part titled "Point 1: <headline>" (type "script").',
  '- A scripture reading is titled "Read: <reference>" (type "bible-verse"). Do not quote long passages from memory; put "Read <reference> aloud." in instructions instead.',
  '- Discussion questions: type "discussion", script is numbered lines "1. …".',
  '- A take-home action is titled "Weekly Challenge: <name>".',
  '- script is only what the leader says out loud; instructions are directions for the leader.',
  FORMAT_RULES,
].join('\n');

export const suggestParts = async (settings: AISettings, service: Service, section: Section, instruction: string): Promise<Part[]> => {
  const result = await chatJson<{ parts?: unknown[] }>(settings, [
    describeService(service),
    '',
    `Suggest 1–3 new parts for the "${section.title}" section that fit the big idea and complement what is already there.`,
    instruction && `Direction from the leader: ${instruction}`,
    `Respond as {"parts":[${PART_SHAPE}]}. Write full scripts and instructions, not outlines.`,
    PART_RULES,
  ].filter(Boolean).join('\n'));
  return (result.parts ?? []).map((p) => newPart((p ?? {}) as Partial<Part>));
};

export const draftService = async (
  settings: AISettings,
  params: { topic: string; audience: string; skeleton: Section[]; series?: Series },
): Promise<Pick<Service, 'title' | 'bigIdea' | 'keyVerse' | 'scripture' | 'sections'>> => {
  const skeleton = params.skeleton.length
    ? `Use exactly this structure, filling in every part:\n${params.skeleton.map((s) => `- ${s.title}: ${s.parts.map((p) => `${p.title} (${p.type}, ${p.minutes} min)`).join('; ')}`).join('\n')}`
    : 'Design 3–5 sections with 1–4 parts each, totaling about 75–90 minutes.';
  const result = await chatJson<Record<string, unknown>>(settings, [
    `Create a complete ministry service about "${params.topic}" for ${params.audience}.`,
    params.series && `It is one week of the series "${params.series.title}".${params.series.bigIdea ? ` Series theme: ${params.series.bigIdea}` : ''}`,
    skeleton,
    `Respond as {"title":"...","bigIdea":"one sentence","scripture":"reference","keyVerse":"verse text (reference)","sections":[{"title":"...","parts":[${PART_SHAPE}]}]}.`,
    'Write full scripts and instructions a volunteer can use directly. The section for small group leaders should have "Small Group" in its title.',
    PART_RULES,
  ].filter(Boolean).join('\n'));
  const service = newService({ ...result, sections: Array.isArray(result.sections) ? result.sections : [] });
  return { title: service.title, bigIdea: service.bigIdea, keyVerse: service.keyVerse, scripture: service.scripture, sections: service.sections };
};

const FAMILY_ASK: Record<keyof FamilyCues, string> = {
  morning: 'a short "wake-up" moment: a verse or truth a parent can say to their child to start the day',
  onTheGo: 'an "on the go" moment: something to talk about, notice, or do together in the car or out and about',
  meal: 'an "around the table" moment: one or two questions a parent can ask at a meal',
  bedtime: 'a "lights out" moment: a short prayer or blessing a parent can pray over their child',
};

export const draftFamilyCue = (settings: AISettings, service: ServiceWithSeries, key: keyof FamilyCues, instruction: string) =>
  chatText(settings, [
    describeService(service),
    '',
    `Write ${FAMILY_ASK[key]} that reinforces this week's lesson for parents of ${service.audience}.`,
    service.family[key] && `The current text is:\n${service.family[key]}\n\nRevise or improve it.`,
    instruction && `Additional direction: ${instruction}`,
    'Write it to the parent, in 1–3 sentences. Return only the text.',
  ].filter(Boolean).join('\n'));

export const draftObjectives = (settings: AISettings, service: ServiceWithSeries, instruction: string) =>
  chatText(settings, [
    describeService(service),
    '',
    `Write 3–5 learning objectives for this session, each starting with a verb and describing what ${service.audience} will know or do by the end.`,
    service.objectives && `The current objectives are:\n${service.objectives}\n\nRevise or improve them.`,
    instruction && `Additional direction: ${instruction}`,
    'Return one objective per line, with no numbering or bullets.',
  ].filter(Boolean).join('\n'));

export const askAboutService = (settings: AISettings, service: Service, question: string) =>
  chatText(settings, `${describeService(service)}\n\nThe leader asks: ${question}\n\nAnswer helpfully and concisely.`);

// ---------- Playbook review ----------

// The whole lesson as plain text, so a review can read what the leader will actually say and do.
export const lessonText = (service: ServiceWithSeries) => {
  const series = service.seriesInfo;
  const lines = [
    `Lesson: "${service.title}" for ${service.audience}.`,
    series && `Series: "${series.title}"${service.week ? `, week ${service.week}` : ''}.${series.bigIdea ? ` Series theme: ${series.bigIdea}` : ''}`,
    service.scripture && `Scripture: ${service.scripture}`,
    service.bigIdea && `Big idea: ${service.bigIdea}`,
    ...service.sections.flatMap((s) => [
      `## ${s.title}`,
      ...s.parts.filter((p) => !p.hidden).flatMap((p) => [
        `### ${p.title} (${p.minutes} min)`,
        p.script && `Leader says: ${p.script}`,
        p.instructions && `Directions: ${p.instructions}`,
        p.leaderNotes && `Leader notes: ${p.leaderNotes}`,
      ]),
    ]),
    '## Family page',
    `Morning: ${service.family.morning}`,
    `On the go: ${service.family.onTheGo}`,
    `Dinner: ${service.family.meal}`,
    `Bedtime: ${service.family.bedtime}`,
  ];
  return lines.filter(Boolean).join('\n');
};

export interface ReviewItem {
  question: string;
  pass: boolean;
  part: string;
  fix: string;
}

// Diana checks one lesson against the playbook's yes/no checklist.
export const reviewLesson = async (settings: AISettings, service: ServiceWithSeries): Promise<ReviewItem[]> => {
  const questions = playbookChecklist(settings.playbook ?? '');
  if (!questions.length) throw new Error('Your playbook has no review checklist. Add a "Lesson review checklist" section of yes/no questions in AI settings.');
  const parsed = await askJson<{ results?: unknown[]; items?: unknown[] }>(settings, [
    { role: 'system', content: `${SYSTEM}\n\nYou review lessons against the leader's Ministry Playbook.\n\n${playbookForDrafting(settings.playbook)}\n\nYou always respond with a single valid JSON object and nothing else.` },
    {
      role: 'user',
      content: [
        lessonText(service),
        '',
        'Check the lesson above against each question. Answer only from what the lesson actually says.',
        ...questions.map((q, i) => `${i + 1}. ${q}`),
        '',
        `Respond as {"results":[{"n":1,"pass":true,"part":"the lesson part this is about","fix":"if pass is false, one specific change to make; otherwise empty"}]} with exactly ${questions.length} results, in order.`,
      ].join('\n'),
    },
  ]);
  const rows = (parsed.results ?? parsed.items ?? []) as { n?: number; pass?: unknown; part?: unknown; fix?: unknown }[];
  return questions.map((question, i) => {
    const r = rows.find((x) => x?.n === i + 1) ?? rows[i] ?? {};
    const pass = r.pass === true || r.pass === 'true' || r.pass === 'yes';
    return { question, pass, part: typeof r.part === 'string' ? r.part : '', fix: pass ? '' : typeof r.fix === 'string' ? r.fix : '' };
  });
};

// ---------- Series ----------

interface WeekOutline {
  title?: string;
  scripture?: string;
  bigIdea?: string;
}

interface WeekDetail {
  objectives?: string[];
  welcome?: string;
  illustration?: { title?: string; script?: string; supplies?: unknown[] };
  transition?: string;
  background?: string;
  teachingPoints?: { point?: string; script?: string }[];
  teaching?: string;
  challenge?: { title?: string; script?: string } | string;
  icebreaker?: string;
  discussionQuestions?: string[];
  prayerFocus?: string;
  family?: Partial<FamilyCues>;
}

export const draftSeries = async (
  settings: AISettings,
  params: { topic: string; audience: string; weeks: number; startDate: string; title?: string; color?: Series['color'] },
  onProgress: (message: string) => void,
): Promise<{ series: Series; weeks: Service[] }> => {
  onProgress('Outlining the series…');
  const outline = await chatJson<{ title?: string; description?: string; bigIdea?: string; memoryVerse?: string; leaderGuide?: string; weeks?: WeekOutline[] }>(settings, [
    `Outline a ${params.weeks}-week ministry series about "${params.topic}" for ${params.audience}.`,
    'Fit the topic into the larger story of the Bible.',
    `Respond as {"title":"series title","description":"2-sentence series overview","bigIdea":"the one idea that ties the series together","memoryVerse":"verse text (reference)","leaderGuide":"a warm 120-word welcome letter to volunteer leaders explaining the series goal and how to lead it","weeks":[{"title":"...","scripture":"reference","bigIdea":"one sentence"}]} with exactly ${params.weeks} weeks.`,
  ].join('\n'));
  const series = newSeries({
    title: params.title || outline.title || params.topic,
    description: outline.description,
    bigIdea: outline.bigIdea,
    memoryVerse: outline.memoryVerse,
    leaderGuide: outline.leaderGuide,
    audience: params.audience,
    startDate: params.startDate,
    color: params.color,
  });
  const seriesTitle = series.title;
  const weeks = (outline.weeks ?? []).slice(0, params.weeks);
  if (!weeks.length) throw new Error('The AI did not return any weeks.');

  const services: Service[] = [];
  for (const [i, week] of weeks.entries()) {
    onProgress(`Writing week ${i + 1} of ${weeks.length}: ${week.title ?? ''}`);
    const d = await chatJson<WeekDetail>(settings, [
      `Series: "${seriesTitle}" for ${params.audience}. Week ${i + 1}: "${week.title}". Scripture: ${week.scripture}. Big idea: ${week.bigIdea}.`,
      'Write the full lesson a volunteer leader can read and use directly.',
      'Respond as {"objectives":["3 short objectives, each starting with a verb"],"welcome":"2-3 sentence welcome that introduces today\'s topic","illustration":{"title":"short name","script":"120-180 word opening story, object lesson, or game setup the leader says, with [directions] in brackets","supplies":[{"name":"...","qty":1,"per":"total|person|group"}]},"transition":"1-2 sentences that bridge from the illustration to the scripture","background":"2-4 sentences of historical or literary context for the passage","teachingPoints":[{"point":"short headline","script":"100-150 words the leader says"}] (exactly 3),"challenge":{"title":"short name","script":"a specific practice for this week, 2-4 sentences"},"icebreaker":"one fun small group opening question tied to the theme","discussionQuestions":["5 questions moving from observation to interpretation to application"],"prayerFocus":"one sentence on what the small group should pray for","family":{"morning":"a truth a parent can say to start the day","onTheGo":"something to talk about or do in the car","meal":"a question to ask at dinner","bedtime":"a short prayer to pray together"}}',
      FORMAT_RULES,
    ].join('\n'));
    const questions = (d.discussionQuestions ?? []).map((q, n) => `${n + 1}. ${q}`).join('\n');
    const challenge = typeof d.challenge === 'string' ? { title: '', script: d.challenge } : d.challenge ?? {};
    const points = d.teachingPoints?.length
      ? d.teachingPoints.map((t, n) => newPart({ title: `Point ${n + 1}: ${t.point ?? ''}`, type: 'script', minutes: 6, script: t.script }))
      : [newPart({ title: week.title || 'Teaching', type: 'script', minutes: 18, script: d.teaching })];
    services.push(newService({
      title: week.title || `Week ${i + 1}`,
      seriesId: series.id,
      week: i + 1,
      audience: params.audience,
      bigIdea: week.bigIdea,
      scripture: week.scripture,
      objectives: (d.objectives ?? []).join('\n'),
      family: d.family,
      sections: [
        newSection({
          title: 'Opening',
          parts: [
            newPart({ title: 'Welcome', type: 'script', minutes: 3, script: d.welcome }),
            newPart({ title: `Illustration: ${d.illustration?.title || 'Opening Story'}`, type: 'script', minutes: 8, script: d.illustration?.script, supplies: d.illustration?.supplies }),
            newPart({ title: 'Transition', type: 'script', minutes: 2, script: d.transition }),
          ],
        }),
        newSection({
          title: 'Scripture',
          parts: [
            newPart({ title: `Read: ${week.scripture || 'Scripture'}`, type: 'bible-verse', minutes: 4, instructions: `Read ${week.scripture || "this week's passage"} aloud from your Bible.` }),
            newPart({ title: 'Background', type: 'script', minutes: 3, script: d.background }),
          ],
        }),
        newSection({ title: 'Teaching', parts: points }),
        newSection({
          title: 'Application',
          parts: [newPart({ title: `Weekly Challenge: ${challenge.title || 'This Week'}`, type: 'script', minutes: 4, script: challenge.script })],
        }),
        newSection({
          title: 'Small Groups',
          parts: [
            newPart({ title: 'Icebreaker', type: 'discussion', minutes: 5, script: d.icebreaker }),
            newPart({ title: 'Discussion', type: 'discussion', minutes: 15, script: questions }),
            newPart({ title: 'Prayer Focus', type: 'prayer', minutes: 5, script: d.prayerFocus }),
          ],
        }),
      ],
    }));
  }
  return { series, weeks: services };
};

// ---------- Diana art-directs the book ----------

const DESIGN_GUIDE = `You are Diana, the art director for a printed church curriculum book made in Parable.
The book's design is JSON. You change it by returning a PATCH that contains only the fields that should change.

Fields and allowed values:
- palette: paper (background of lesson pages; must stay light), ink (text), accent (main color), secondary, muted, deep (the dark color for full-bleed pages and dark panels). Colors are "#RRGGBB".
- type.display (headings): jakarta (modern sans), fraunces (classic serif), dmserif (editorial serif), oswald (tall condensed), nunito (rounded), grotesk (geometric grotesk), inter (neutral sans), mono (technical monospace).
- type.body (reading text): serif | sans | rounded.   type.label (small labels): sans | mono.   type.headingCase: normal | caps.
- page.corners: round | soft | square.   page.headerRule (line under page titles): ink | accent | heavy.
- page.mark (a tiny symbol on lesson page headers): none | x | ring | arrow | crosshair | barcode | dot.
- components.questions: numbers | boxed.   components.scripture: panel | rule.
- cover and divider pages: background (paper | ink | accent | secondary | muted | deep), layout (bottom | center | top), align (left | center | right), titleScale (0.7 to 1.4), titleDirection (across | up; up = huge vertical title reading bottom to top like a book spine), titleBox (none | outline | solid; a label box around the small text), showCount (true/false, cover only), motifs (list of shapes).
- A motif: {"type": band|circle|ring|x|track|line|frame|arrow|grid|barcode|stripes|crosshair|label, "x": 0 to 1 (0 = left edge, 1 = right edge), "y": 0 to 1 (0 = top, 1 = bottom), "size": fraction of the page width, "aspect": width divided by height (for frame, grid, stripes, barcode, track), "rotation": degrees, "tone": paper|ink|accent|secondary|muted|deep, "style": solid|outline, "opacity": 0.05 to 1, "count": rings in a ring / bars in a barcode / cells in a grid, "text": short text for a label}.
  band = a long strip across the page (size = thickness); track = a rounded pill/rail shape; stripes = a box of thin diagonal lines; x = a bold X mark.
  Shapes may run past the page edges. Parable keeps the title area readable automatically.

Rules:
- Change only what the leader asked for. Do not repeat fields that stay the same.
- To change shapes on the cover or dividers, return the COMPLETE new motifs list for that page, keeping shapes you were not asked to change.
- Lesson pages must stay calm and easy to read: carry a style there through palette, fonts, header rule, page mark and component styles, never big shapes.
- Respond with JSON only: {"patch": { ...only changed fields... }, "note": "one or two friendly sentences telling the leader what you changed"}`;

export interface DesignProposal {
  design: BookDesign;
  patch: BookDesignPatch;
  note: string;
}

const parsePatch = (text: string) => {
  const result = parseJsonLoose<Record<string, unknown>>(text);
  // Small models sometimes skip the wrapper and return the patch itself.
  const { note, patch: wrapped, ...rest } = result;
  return { patch: (wrapped && typeof wrapped === 'object' ? wrapped : rest) as Record<string, unknown>, note: typeof note === 'string' ? note : '' };
};

// One focused request that changes only what the leader asked (colors, fonts, page settings, built-in cover).
// Whole new layouts come from layout files instead (see LayoutPack), which a small model can't write well.
export const designPatch = async (settings: AISettings, current: BookDesign, instruction: string): Promise<DesignProposal> => {
  const { patch, note } = parsePatch(await chat(settings, [
    { role: 'system', content: DESIGN_GUIDE },
    { role: 'user', content: `Current design: ${describeDesign(current)}\n\nThe leader says: "${instruction}"` },
  ], true));
  delete (patch as Record<string, unknown>).custom;
  return { design: applyPatch(current, patch), patch, note: note || 'Here is a new version. Preview it and apply it if you like it.' };
};
