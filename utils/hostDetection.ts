import { ChatMessage } from './youtube';

/**
 * Identify the host of the stream
 * Priority 1: Manual input (if provided)
 * Priority 2: Badge detection (owner, moderator)
 * Priority 3: Most active user with questions (heuristic)
 */
export const identifyHost = (
  messages: ChatMessage[],
  manualHostName?: string
): string | null => {
  // Priority 1: Manual input
  if (manualHostName) {
    return manualHostName;
  }

  // Priority 2: Badge detection - look for 'owner' or 'moderator' badges
  for (const msg of messages) {
    if (msg.badges?.includes('owner')) {
      return msg.author;
    }
  }

  // If no owner found, check for moderator (but less reliable)
  for (const msg of messages) {
    if (msg.badges?.includes('moderator')) {
      const modCount = messages.filter(m => m.author === msg.author).length;
      // Only consider as host if they have significant message count
      if (modCount > Math.max(5, messages.length / 100)) {
        return msg.author;
      }
    }
  }

  // Priority 3: Most active user heuristic (fallback)
  // Count messages per author
  const authorCounts = new Map<string, number>();
  messages.forEach(msg => {
    authorCounts.set(msg.author, (authorCounts.get(msg.author) || 0) + 1);
  });

  if (authorCounts.size === 0) return null;

  // Find the most active user
  let topAuthor = '';
  let maxCount = 0;
  authorCounts.forEach((count, author) => {
    if (count > maxCount) {
      maxCount = count;
      topAuthor = author;
    }
  });

  // Only return if they have at least 5% of all messages
  if (maxCount > messages.length * 0.05) {
    return topAuthor;
  }

  return null;
};

/**
 * Flag host messages in the message array
 */
export const flagHostMessages = (
  messages: ChatMessage[],
  hostName: string
): ChatMessage[] => {
  return messages.map(msg => ({
    ...msg,
    isHost: msg.author === hostName,
  }));
};
