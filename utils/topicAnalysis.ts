import { ChatMessage, TopicCluster, KeywordTrend } from './youtube';

// Common English stopwords
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me',
  'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'what',
  'which', 'who', 'whom', 'why', 'how', 'when', 'where', 'if', 'so', 'no', 'not', 'just',
  'up', 'down', 'out', 'in', 'it', 'ok', 'lol', 'haha', 'hehe', 'yeah', 'yes', 'no',
]);

/**
 * Extract keywords from messages
 * Removes stopwords and returns n-grams with frequency
 */
export const extractKeywords = (
  messages: ChatMessage[]
): { keyword: string; frequency: number }[] => {
  const keywordMap = new Map<string, number>();

  messages.forEach(msg => {
    // Split into words and convert to lowercase
    const words = msg.message
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation except spaces
      .split(/\s+/)
      .filter(word => word.length > 0 && !STOPWORDS.has(word));

    // Extract unigrams (single words)
    words.forEach(word => {
      if (word.length > 2) { // Minimum 3 characters
        keywordMap.set(word, (keywordMap.get(word) || 0) + 1);
      }
    });

    // Extract bigrams (2-word phrases)
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (!STOPWORDS.has(words[i]) && !STOPWORDS.has(words[i + 1])) {
        keywordMap.set(bigram, (keywordMap.get(bigram) || 0) + 1);
      }
    }

    // Extract trigrams (3-word phrases)
    for (let i = 0; i < words.length - 2; i++) {
      if (!STOPWORDS.has(words[i]) && !STOPWORDS.has(words[i + 1]) && !STOPWORDS.has(words[i + 2])) {
        const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        keywordMap.set(trigram, (keywordMap.get(trigram) || 0) + 1);
      }
    }
  });

  // Filter keywords with minimum frequency
  const minFrequency = Math.max(2, Math.ceil(messages.length / 100));
  const keywords = Array.from(keywordMap.entries())
    .filter(([, frequency]) => frequency >= minFrequency)
    .map(([keyword, frequency]) => ({ keyword, frequency }))
    .sort((a, b) => b.frequency - a.frequency);

  return keywords.slice(0, 50); // Return top 50 keywords
};

/**
 * Cluster messages by topic/keyword similarity
 */
export const clusterByTopic = (
  messages: ChatMessage[],
  keywords: { keyword: string; frequency: number }[]
): TopicCluster[] => {
  const clusters: TopicCluster[] = [];
  const processedMessages = new Set<string>();

  // For each high-frequency keyword, create a topic cluster
  const topKeywords = keywords.slice(0, 15).map(k => k.keyword);

  topKeywords.forEach(keyword => {
    const relatedMessages = messages.filter(msg => {
      const lowerMessage = msg.message.toLowerCase();
      return lowerMessage.includes(keyword.toLowerCase());
    });

    if (relatedMessages.length >= 2) {
      // Get unique contributors
      const contributors = Array.from(new Set(relatedMessages.map(m => m.author)));

      // Find time range
      const timestamps = relatedMessages.map(m => new Date(m.timestamp).getTime());
      const startTime = new Date(Math.min(...timestamps)).toISOString();
      const endTime = new Date(Math.max(...timestamps)).toISOString();

      clusters.push({
        topic: keyword,
        keywords: [keyword], // Could expand to related keywords
        messageCount: relatedMessages.length,
        topContributors: contributors.slice(0, 5),
        timeRange: { start: startTime, end: endTime },
      });

      // Mark these messages as processed
      relatedMessages.forEach(m => processedMessages.add(m.id));
    }
  });

  // Sort by message count
  clusters.sort((a, b) => b.messageCount - a.messageCount);

  return clusters;
};

/**
 * Calculate keyword trends over time
 */
export const calculateKeywordTrends = (
  messages: ChatMessage[],
  keywords: { keyword: string; frequency: number }[]
): KeywordTrend[] => {
  if (messages.length < 2) return [];

  // Split messages into three time periods
  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const thirdSize = Math.ceil(sortedMessages.length / 3);
  const period1 = sortedMessages.slice(0, thirdSize);
  const period2 = sortedMessages.slice(thirdSize, thirdSize * 2);
  const period3 = sortedMessages.slice(thirdSize * 2);

  const trends: KeywordTrend[] = [];

  keywords.slice(0, 20).forEach(({ keyword }) => {
    // Count occurrences in each period
    const countInPeriod = (period: ChatMessage[]) =>
      period.filter(msg => msg.message.toLowerCase().includes(keyword.toLowerCase())).length;

    const freq1 = countInPeriod(period1);
    const freq2 = countInPeriod(period2);
    const freq3 = countInPeriod(period3);

    // Determine trend
    let trend: 'rising' | 'stable' | 'declining' = 'stable';
    const rise = freq3 - freq1;

    if (rise > Math.max(freq1, freq2) * 0.3) {
      trend = 'rising';
    } else if (rise < -Math.max(freq1, freq2) * 0.3) {
      trend = 'declining';
    }

    trends.push({
      keyword,
      frequency: freq1 + freq2 + freq3,
      trend,
    });
  });

  return trends.sort((a, b) => b.frequency - a.frequency);
};
