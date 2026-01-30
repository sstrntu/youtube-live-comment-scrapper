import { ChatMessage, ConversationThread, CommunityMember } from './youtube';

/**
 * Detect conversation threads
 * Groups messages by temporal proximity and mentions
 */
export const detectThreads = (
  messages: ChatMessage[],
  timeWindowSeconds: number = 120
): ConversationThread[] => {
  if (messages.length < 3) return [];

  const threads: ConversationThread[] = [];
  const processedIndices = new Set<number>();

  // Sort messages by timestamp
  const sortedMessages = [...messages].map((msg, idx) => ({ msg, originalIdx: idx }))
    .sort((a, b) => new Date(a.msg.timestamp).getTime() - new Date(b.msg.timestamp).getTime());

  let threadCounter = 0;

  for (let i = 0; i < sortedMessages.length; i++) {
    if (processedIndices.has(i)) continue;

    const startMsg = sortedMessages[i];
    const threadMessages = [startMsg];
    const participants = new Set<string>([startMsg.msg.author]);

    // Look ahead for related messages
    for (let j = i + 1; j < sortedMessages.length && j < i + 20; j++) {
      if (processedIndices.has(j)) continue;

      const currentMsg = sortedMessages[j];
      const timeDiff =
        (new Date(currentMsg.msg.timestamp).getTime() -
          new Date(startMsg.msg.timestamp).getTime()) /
        1000;

      // Check if message is within time window
      if (timeDiff > timeWindowSeconds) break;

      // Check for relevance:
      // 1. Same author replying again
      // 2. Direct reply (@mention)
      // 3. Within conversation time window
      const isSameAuthor = currentMsg.msg.author === startMsg.msg.author;
      const isMention = startMsg.msg.message.includes(`@${currentMsg.msg.author}`) ||
                       currentMsg.msg.message.includes(`@${startMsg.msg.author}`);
      const isWithinWindow = timeDiff <= timeWindowSeconds;

      if (isWithinWindow) {
        threadMessages.push(currentMsg);
        participants.add(currentMsg.msg.author);
        processedIndices.add(j);
      }
    }

    // Only create thread if it has at least 3 messages
    if (threadMessages.length >= 3) {
      const startTime = threadMessages[0].msg.timestamp;
      const endTime = threadMessages[threadMessages.length - 1].msg.timestamp;

      threads.push({
        threadId: `thread-${threadCounter++}`,
        participants: Array.from(participants),
        messageCount: threadMessages.length,
        startTime,
        endTime,
        messages: threadMessages.map(tm => tm.msg.id),
      });

      // Mark all messages in thread as processed
      threadMessages.forEach(tm => {
        processedIndices.add(sortedMessages.indexOf(tm));
      });
    }
  }

  return threads;
};

/**
 * Calculate engagement score for a community member
 * Weighted composite score based on multiple metrics
 */
export const calculateEngagementScore = (
  author: string,
  messages: ChatMessage[],
  threads: ConversationThread[],
  answeredQuestions: number,
  streamDurationMinutes: number
): number => {
  // Get author's messages
  const authorMessages = messages.filter(m => m.author === author);
  const messageCount = authorMessages.length;

  if (messageCount === 0) return 0;

  // Message frequency (messages per hour)
  const messagesPerHour = streamDurationMinutes > 0
    ? (messageCount / streamDurationMinutes) * 60
    : 0;

  // Response timing (quick replies)
  let avgResponseTime = 120; // default 2 minutes
  if (authorMessages.length > 1) {
    let totalGap = 0;
    let gapCount = 0;
    for (let i = 1; i < authorMessages.length; i++) {
      const timeDiff = (new Date(authorMessages[i].timestamp).getTime() -
        new Date(authorMessages[i - 1].timestamp).getTime()) / 1000;
      if (timeDiff <= 300) { // Only count gaps under 5 minutes
        totalGap += timeDiff;
        gapCount++;
      }
    }
    if (gapCount > 0) {
      avgResponseTime = totalGap / gapCount;
    }
  }

  // Conversation participation
  const authorThreads = threads.filter(t => t.participants.includes(author));
  const conversationCount = authorThreads.length;

  // Scoring logic (weighted)
  // 30% message frequency
  const frequencyScore = Math.min(100, (messagesPerHour / 10) * 100);

  // 25% question answering
  const answeringScore = answeredQuestions > 0 ? Math.min(100, answeredQuestions * 10) : 0;

  // 25% response timing (fast replies are better)
  const speedScore = Math.max(0, 100 - (avgResponseTime / 120) * 100);

  // 20% conversation participation
  const conversationScore = Math.min(100, (conversationCount / 5) * 100);

  const totalScore =
    (frequencyScore * 0.3) +
    (answeringScore * 0.25) +
    (speedScore * 0.25) +
    (conversationScore * 0.2);

  return Math.round(Math.min(100, totalScore));
};

/**
 * Identify active community members
 */
export const identifyActiveCommunityMembers = (
  messages: ChatMessage[],
  threads: ConversationThread[],
  questionAnswerers: Map<string, number> = new Map()
): CommunityMember[] => {
  const streamDurationMinutes = calculateStreamDuration(messages);
  const members = new Map<string, CommunityMember>();

  // Count messages per author
  const authorMessageCount = new Map<string, number>();
  const authorProfileImage = new Map<string, string>();
  const authorBadges = new Map<string, string[]>();

  messages.forEach(msg => {
    authorMessageCount.set(msg.author, (authorMessageCount.get(msg.author) || 0) + 1);
    if (!authorProfileImage.has(msg.author)) {
      authorProfileImage.set(msg.author, msg.profileImageUrl);
    }
    if (msg.badges && msg.badges.length > 0) {
      authorBadges.set(msg.author, msg.badges);
    }
  });

  // Create member entries
  authorMessageCount.forEach((totalMessages, author) => {
    const messagesPerHour = streamDurationMinutes > 0
      ? (totalMessages / streamDurationMinutes) * 60
      : 0;

    const questionsAnswered = questionAnswerers.get(author) || 0;

    // Calculate response time
    const authorMessages = messages.filter(m => m.author === author);
    let avgResponseTime = 120;
    if (authorMessages.length > 1) {
      let totalGap = 0;
      let gapCount = 0;
      for (let i = 1; i < authorMessages.length; i++) {
        const timeDiff = (new Date(authorMessages[i].timestamp).getTime() -
          new Date(authorMessages[i - 1].timestamp).getTime()) / 1000;
        if (timeDiff <= 300) {
          totalGap += timeDiff;
          gapCount++;
        }
      }
      if (gapCount > 0) {
        avgResponseTime = totalGap / gapCount;
      }
    }

    const conversationCount = threads.filter(t => t.participants.includes(author)).length;

    const engagementScore = calculateEngagementScore(
      author,
      messages,
      threads,
      questionsAnswered,
      streamDurationMinutes
    );

    members.set(author, {
      author,
      profileImageUrl: authorProfileImage.get(author) || '',
      engagementScore,
      metrics: {
        totalMessages,
        messagesPerHour,
        questionsAnswered,
        avgResponseTime,
        conversationCount,
      },
      badges: authorBadges.get(author),
    });
  });

  // Sort by engagement score and return top members
  const sorted = Array.from(members.values())
    .sort((a, b) => b.engagementScore - a.engagementScore);

  return sorted.slice(0, 20); // Return top 20 members
};

/**
 * Calculate stream duration in minutes
 */
export const calculateStreamDuration = (messages: ChatMessage[]): number => {
  if (messages.length < 2) return 0;

  const timestamps = messages.map(m => new Date(m.timestamp).getTime());
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);

  return (maxTime - minTime) / (1000 * 60);
};
