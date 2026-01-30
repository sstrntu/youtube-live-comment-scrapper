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
