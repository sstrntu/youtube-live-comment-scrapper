import { ChatMessage, EngagementAnalysis } from './youtube';
import { identifyHost, flagHostMessages } from './hostDetection';
import { extractHostQuestions, rankQuestionAnswerers } from './questionAnalysis';
import { extractKeywords, clusterByTopic, calculateKeywordTrends } from './topicAnalysis';
import { detectThreads, identifyActiveCommunityMembers, calculateStreamDuration } from './conversationThreading';

/**
 * Main orchestrator for engagement analysis
 * Coordinates all sub-analyses and merges results
 */
export const analyzeEngagement = (
  messages: ChatMessage[],
  hostIdentifier?: string,
  useAI?: boolean
): EngagementAnalysis => {
  // Validate input
  if (messages.length === 0) {
    return createEmptyAnalysis();
  }

  // Step 1: Identify host
  const hostName = identifyHost(messages, hostIdentifier) || 'Unknown Host';
  const messagesWithHost = flagHostMessages(messages, hostName);

  // Step 2: Extract host questions and answers
  const hostQuestions = extractHostQuestions(messagesWithHost, hostName);
  const questionAnswerers = rankQuestionAnswerers(hostQuestions, messagesWithHost);

  // Build answerers map for community member scoring
  const answerersMap = new Map<string, number>();
  questionAnswerers.forEach(qa => {
    answerersMap.set(qa.author, qa.questionsAnswered);
  });

  // Step 3: Topic analysis
  const keywords = extractKeywords(messagesWithHost);
  const topicClusters = clusterByTopic(messagesWithHost, keywords);
  const trendingKeywords = calculateKeywordTrends(messagesWithHost, keywords);

  // Step 4: Conversation threading
  const conversationThreads = detectThreads(messagesWithHost);

  // Step 5: Community member identification
  const activeCommunityMembers = identifyActiveCommunityMembers(
    messagesWithHost,
    conversationThreads,
    answerersMap
  );

  // Step 6: Calculate summary stats
  const totalQuestions = hostQuestions.length;
  const answeredQuestions = hostQuestions.filter(q => q.wasAnswered).length;
  const averageResponseTime = calculateAverageResponseTime(hostQuestions);
  const topTopics = topicClusters.slice(0, 5).map(t => t.topic);

  return {
    hostQuestions,
    questionAnswerers,
    topicClusters,
    trendingKeywords,
    activeCommunityMembers,
    conversationThreads,
    totalQuestions,
    answeredQuestions,
    averageResponseTime,
    topTopics,
    hostName,
  };
};

/**
 * Create empty analysis structure
 */
function createEmptyAnalysis(): EngagementAnalysis {
  return {
    hostQuestions: [],
    questionAnswerers: [],
    topicClusters: [],
    trendingKeywords: [],
    activeCommunityMembers: [],
    conversationThreads: [],
    totalQuestions: 0,
    answeredQuestions: 0,
    averageResponseTime: 0,
    topTopics: [],
    hostName: 'Unknown Host',
  };
}

/**
 * Calculate average response time across all Q&A
 */
function calculateAverageResponseTime(hostQuestions: any[]): number {
  if (hostQuestions.length === 0) return 0;

  let totalResponseTime = 0;
  let answerCount = 0;

  hostQuestions.forEach(question => {
    question.answers.forEach((answer: any) => {
      totalResponseTime += answer.responseTimeSeconds;
      answerCount++;
    });
  });

  return answerCount > 0 ? Math.round(totalResponseTime / answerCount) : 0;
}
