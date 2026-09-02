import { addDays, startOfDay } from 'date-fns';

const weekdayIndexes: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

type DateMatch = {
  date: Date;
  start: number;
  end: number;
};

type TimeMatch = {
  hours: number;
  minutes: number;
  start: number;
  end: number;
};

export type ParsedTodoInput = {
  cleanedText: string;
  dueDate?: Date;
  hasDueTime: boolean;
  matchedDate: boolean;
  matchedTime: boolean;
};

export type TodoInputHighlightPart = {
  text: string;
  highlight: boolean;
};

const dateTokenPattern = /\b(?:on\s+)?(today|tomorrow|yesterday|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i;
const meridiemTimeTokenPattern = /\b(?:at\s+)?([1-9]|1[0-2])(?::([0-5]\d))?\s*(am|pm)\b/i;
const twentyFourHourTimeTokenPattern = /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:am|pm))/i;

const getCommittedPreviewText = (input: string) => {
  if (!input) {
    return input;
  }

  if (/\s$/.test(input)) {
    return input;
  }

  const lastWhitespaceIndex = input.search(/\s\S*$/);
  if (lastWhitespaceIndex === -1) {
    return '';
  }

  return input.slice(0, lastWhitespaceIndex + 1);
};

const parseTimeToken = (token: string, start: number): TimeMatch | undefined => {
  const meridiemMatch = meridiemTimeTokenPattern.exec(token);
  if (meridiemMatch) {
    const rawHours = Number(meridiemMatch[1]);
    const minutes = Number(meridiemMatch[2] || '0');
    const meridiem = meridiemMatch[3].toLowerCase();
    const hours = rawHours % 12 + (meridiem === 'pm' ? 12 : 0);

    return {
      hours,
      minutes,
      start,
      end: start + token.length,
    };
  }

  const twentyFourHourMatch = twentyFourHourTimeTokenPattern.exec(token);
  if (!twentyFourHourMatch) {
    return undefined;
  }

  return {
    hours: Number(twentyFourHourMatch[1]),
    minutes: Number(twentyFourHourMatch[2]),
    start,
    end: start + token.length,
  };
};

const collectTodoMatches = (
  input: string,
  now: Date,
  options?: {
    committedOnly?: boolean;
  }
) => {
  const subject = options?.committedOnly ? getCommittedPreviewText(input) : input;
  const tokenPattern = /\b(?:on\s+)?(?:today|tomorrow|yesterday|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\b(?:at\s+)?(?:[1-9]|1[0-2])(?::[0-5]\d)?\s*(?:am|pm)\b|\b(?:at\s+)?(?:[01]?\d|2[0-3]):[0-5]\d\b(?!\s*(?:am|pm))/gi;

  let dateMatch: DateMatch | undefined;
  let timeMatch: TimeMatch | undefined;

  for (const tokenMatch of subject.matchAll(tokenPattern)) {
    const token = tokenMatch[0];
    const start = tokenMatch.index ?? 0;

    if (!dateMatch && dateTokenPattern.test(token)) {
      const match = dateTokenPattern.exec(token);
      if (!match) {
        continue;
      }

      const keyword = match[1].toLowerCase();
      const date = startOfDay(now);

      if (keyword === 'tomorrow') {
        dateMatch = { date: addDays(date, 1), start, end: start + token.length };
      } else if (keyword === 'yesterday') {
        dateMatch = { date: addDays(date, -1), start, end: start + token.length };
      } else {
        if (keyword !== 'today') {
          const targetDay = weekdayIndexes[keyword];
          const currentDay = date.getDay();
          const diff = (targetDay - currentDay + 7) % 7;
          date.setDate(date.getDate() + diff);
        }

        dateMatch = { date, start, end: start + token.length };
      }

      if (timeMatch) {
        break;
      }

      continue;
    }

    if (!timeMatch) {
      const parsedTime = parseTimeToken(token, start);
      if (parsedTime) {
        timeMatch = parsedTime;
        if (dateMatch) {
          break;
        }
      }
    }
  }

  return {
    subject,
    dateMatch,
    timeMatch,
  };
};

const cleanTodoTitle = (input: string, ranges: Array<{ start: number; end: number }>) => {
  if (!ranges.length) {
    return input.trim();
  }

  const orderedRanges = ranges
    .slice()
    .sort((a, b) => a.start - b.start)
    .filter((range, index, array) => index === 0 || range.start >= array[index - 1].end);

  let cursor = 0;
  let cleaned = '';

  for (const range of orderedRanges) {
    cleaned += input.slice(cursor, range.start);
    cursor = range.end;
  }

  cleaned += input.slice(cursor);

  return cleaned
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/^[,.;!?]\s*/, '')
    .replace(/\s*[,.;!?]$/, '')
    .trim();
};

export const getTodoHasDueTime = (dueDate?: Date | null, hasDueTime?: boolean | null) => {
  if (!dueDate) {
    return false;
  }

  if (typeof hasDueTime === 'boolean') {
    return hasDueTime;
  }

  return (
    dueDate.getHours() !== 0 ||
    dueDate.getMinutes() !== 0 ||
    dueDate.getSeconds() !== 0 ||
    dueDate.getMilliseconds() !== 0
  );
};

export const getTodoInputHighlightParts = (
  input: string,
  options?: {
    committedOnly?: boolean;
  }
): TodoInputHighlightPart[] => {
  if (!input) {
    return [{ text: '', highlight: false }];
  }

  const { dateMatch, timeMatch } = collectTodoMatches(input, new Date(), {
    committedOnly: options?.committedOnly,
  });
  const ranges = [dateMatch, timeMatch]
    .filter((match): match is DateMatch | TimeMatch => !!match)
    .map((match) => ({ start: match.start, end: match.end }))
    .sort((a, b) => a.start - b.start);

  const parts: TodoInputHighlightPart[] = [];
  let lastIndex = 0;

  for (const range of ranges) {
    const start = range.start;
    if (start > lastIndex) {
      parts.push({ text: input.slice(lastIndex, start), highlight: false });
    }

    parts.push({ text: input.slice(range.start, range.end), highlight: true });
    lastIndex = range.end;
  }

  if (lastIndex < input.length) {
    parts.push({ text: input.slice(lastIndex), highlight: false });
  }

  return parts.length ? parts : [{ text: input, highlight: false }];
};

export const parseTodoInput = (
  input: string,
  options?: {
    now?: Date;
    fallbackDate?: Date;
    committedOnly?: boolean;
  }
): ParsedTodoInput => {
  const now = options?.now || new Date();
  const { subject, dateMatch, timeMatch } = collectTodoMatches(input, now, {
    committedOnly: options?.committedOnly,
  });
  const cleanedText = cleanTodoTitle(
    subject,
    [dateMatch, timeMatch].reduce<Array<{ start: number; end: number }>>((ranges, match) => {
      if (match) {
        ranges.push({ start: match.start, end: match.end });
      }
      return ranges;
    }, [])
  );

  if (!dateMatch && !timeMatch) {
    return {
      cleanedText,
      hasDueTime: false,
      matchedDate: false,
      matchedTime: false,
    };
  }

  const baseDate = startOfDay(dateMatch?.date || options?.fallbackDate || now);

  if (!timeMatch) {
    return {
      cleanedText,
      dueDate: baseDate,
      hasDueTime: false,
      matchedDate: true,
      matchedTime: false,
    };
  }

  const dueDate = new Date(baseDate);
  dueDate.setHours(timeMatch.hours, timeMatch.minutes, 0, 0);

  if (!dateMatch && !options?.fallbackDate && dueDate.getTime() < now.getTime()) {
    dueDate.setDate(dueDate.getDate() + 1);
  }

  return {
    cleanedText,
    dueDate,
    hasDueTime: true,
    matchedDate: !!dateMatch,
    matchedTime: true,
  };
};

export const removeTodoInputTime = (input: string) => {
  if (!input) {
    return '';
  }

  const { timeMatch } = collectTodoMatches(input, new Date());
  if (!timeMatch) {
    return input;
  }

  return cleanTodoTitle(input, [{ start: timeMatch.start, end: timeMatch.end }]);
};
