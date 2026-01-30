export const getVideoId = (url: string): string | null => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|live\/)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

export interface ChatMessage {
  id: string;
  author: string;
  message: string;
  timestamp: string;
  profileImageUrl: string;
  type?: 'text' | 'paid' | 'membership' | 'sticker';
  amount?: string;
  source?: 'youtubei' | 'api';

  // NEW FIELDS for advanced analytics
  badges?: string[];  // ['moderator', 'member', 'verified', 'owner']
  authorChannelId?: string;  // Unique channel ID for the author
  isHost?: boolean;  // Flagged if identified as host
  containsQuestion?: boolean;  // Auto-detected question
  mentionedUsers?: string[];  // @mentioned usernames
  detectedTopics?: string[];  // Keywords/themes (cached from analysis)
}

export interface InsightData {
  totalMessages: number;
  uniqueUsers: number;
  messageRate: { timestamp: string; count: number }[];
  topContributors: { author: string; count: number; profileImageUrl: string }[];
  superChatRevenue: { total: number; currency: string; count: number };
  messageTypeBreakdown: { text: number; paid: number; membership: number; sticker: number };
  averageMessageLength: number;
  timeRange: { firstMessage: string; lastMessage: string; durationMinutes: number };
  peakActivity: { timestamp: string; messagesPerMinute: number };
}

// Advanced Engagement Analytics Interfaces

export interface HostQuestion {
  messageId: string;
  author: string;
  question: string;
  timestamp: string;
  answers: Answer[];
  wasAnswered: boolean;
}

export interface Answer {
  messageId: string;
  author: string;
  message: string;
  timestamp: string;
  responseTimeSeconds: number;
}

export interface QuestionAnswerer {
  author: string;
  profileImageUrl: string;
  questionsAnswered: number;
  averageResponseTime: number;
  helpfulnessScore: number;
}

export interface TopicCluster {
  topic: string;
  keywords: string[];
  messageCount: number;
  topContributors: string[];
  timeRange: { start: string; end: string };
}

export interface KeywordTrend {
  keyword: string;
  frequency: number;
  trend: 'rising' | 'stable' | 'declining';
}

export interface CommunityMember {
  author: string;
  profileImageUrl: string;
  engagementScore: number;
  metrics: {
    totalMessages: number;
    messagesPerHour: number;
    questionsAnswered: number;
    avgResponseTime: number;
    conversationCount: number;
  };
  badges?: string[];
}

export interface ConversationThread {
  threadId: string;
  participants: string[];
  messageCount: number;
  startTime: string;
  endTime: string;
  messages: string[];  // Message IDs in thread
  topic?: string;
}

export interface EngagementAnalysis {
  // Host Q&A Analysis
  hostQuestions: HostQuestion[];
  questionAnswerers: QuestionAnswerer[];

  // Topic Analysis
  topicClusters: TopicCluster[];
  trendingKeywords: KeywordTrend[];

  // Community Engagement
  activeCommunityMembers: CommunityMember[];
  conversationThreads: ConversationThread[];

  // Summary Stats
  totalQuestions: number;
  answeredQuestions: number;
  averageResponseTime: number;
  topTopics: string[];
  hostName?: string;
}

export const getLiveChatId = async (apiKey: string, videoId: string): Promise<string> => {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${apiKey}`
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to fetch video details');
  }

  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    throw new Error('Video not found');
  }

  const liveStreamingDetails = data.items[0].liveStreamingDetails;

  if (!liveStreamingDetails) {
    throw new Error('This video does not have live streaming details');
  }

  if (!liveStreamingDetails.activeLiveChatId) {
    if (liveStreamingDetails.actualEndTime) {
      throw new Error('This live stream has ended. This tool only supports scraping chat from CURRENTLY LIVE streams, not replays.');
    }
    throw new Error('No active live chat found for this video. The stream might be offline or chat is disabled.');
  }

  return liveStreamingDetails.activeLiveChatId;
};

export const fetchChatMessages = async (
  apiKey: string,
  liveChatId: string,
  pageToken?: string
): Promise<{ messages: ChatMessage[]; nextPageToken: string; pollingIntervalMillis: number }> => {
  let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${liveChatId}&part=snippet,authorDetails&key=${apiKey}`;
  if (pageToken) {
    url += `&pageToken=${pageToken}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to fetch chat messages');
  }

  const data = await response.json();

  const messages: ChatMessage[] = (data.items || []).map((item: {
    id: string;
    authorDetails: { displayName: string; profileImageUrl: string };
    snippet: { displayMessage: string; publishedAt: string };
  }) => ({
    id: item.id,
    author: item.authorDetails.displayName,
    message: item.snippet.displayMessage,
    timestamp: item.snippet.publishedAt,
    profileImageUrl: item.authorDetails.profileImageUrl,
  }));

  return {
    messages,
    nextPageToken: data.nextPageToken,
    pollingIntervalMillis: data.pollingIntervalMillis,
  };
};
