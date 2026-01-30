import { ChatMessage, InsightData } from './youtube';

export const parseAmount = (amountString: string): { value: number; currency: string } => {
  // Parse strings like "$5.00" or "¥500"
  const match = amountString.match(/([^\d.]*)?([\d.]+)/);
  if (!match) {
    return { value: 0, currency: 'USD' };
  }

  const [, currencySymbol, amountStr] = match;
  const value = parseFloat(amountStr);

  // Map common currency symbols
  const currencyMap: Record<string, string> = {
    '$': 'USD',
    '€': 'EUR',
    '¥': 'JPY',
    '£': 'GBP',
    '₹': 'INR',
    'R$': 'BRL',
    '₽': 'RUB',
  };

  const currency = currencySymbol ? (currencyMap[currencySymbol.trim()] || 'USD') : 'USD';

  return { value: isNaN(value) ? 0 : value, currency };
};

export const groupByMinute = (messages: ChatMessage[]): Map<string, ChatMessage[]> => {
  const grouped = new Map<string, ChatMessage[]>();

  messages.forEach(msg => {
    const date = new Date(msg.timestamp);
    const minute = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()).toISOString();

    if (!grouped.has(minute)) {
      grouped.set(minute, []);
    }
    grouped.get(minute)!.push(msg);
  });

  return grouped;
};

export const calculateMessageRate = (messages: ChatMessage[]): { timestamp: string; count: number }[] => {
  const grouped = groupByMinute(messages);
  const sorted = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([timestamp, msgs]) => ({ timestamp, count: msgs.length }));

  return sorted;
};

export const calculateInsights = (messages: ChatMessage[]): InsightData => {
  // Filter out messages with invalid data
  const validMessages = messages.filter(msg => msg.id && msg.author && msg.timestamp);

  if (validMessages.length === 0) {
    return {
      totalMessages: 0,
      uniqueUsers: 0,
      messageRate: [],
      topContributors: [],
      superChatRevenue: { total: 0, currency: 'USD', count: 0 },
      messageTypeBreakdown: { text: 0, paid: 0, membership: 0, sticker: 0 },
      averageMessageLength: 0,
      timeRange: { firstMessage: '', lastMessage: '', durationMinutes: 0 },
      peakActivity: { timestamp: '', messagesPerMinute: 0 },
    };
  }

  // Total messages
  const totalMessages = validMessages.length;

  // Unique users
  const uniqueUsers = new Set(validMessages.map(m => m.author)).size;

  // Message rate
  const messageRate = calculateMessageRate(validMessages);

  // Top contributors
  const contributorMap = new Map<string, { count: number; profileImageUrl: string }>();
  validMessages.forEach(msg => {
    if (!contributorMap.has(msg.author)) {
      contributorMap.set(msg.author, { count: 0, profileImageUrl: msg.profileImageUrl });
    }
    const contributor = contributorMap.get(msg.author)!;
    contributor.count += 1;
  });

  const topContributors = Array.from(contributorMap.entries())
    .map(([author, data]) => ({
      author,
      count: data.count,
      profileImageUrl: data.profileImageUrl,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Super chat revenue
  let superChatTotal = 0;
  let superChatCount = 0;
  let mainCurrency = 'USD';

  validMessages.forEach(msg => {
    if ((msg.type === 'paid' || msg.type === 'sticker') && msg.amount) {
      try {
        const { value, currency } = parseAmount(msg.amount);
        if (superChatCount === 0) mainCurrency = currency;
        superChatTotal += value || 0;
        superChatCount += 1;
      } catch (e) {
        console.error('Error parsing amount:', msg.amount);
      }
    }
  });

  const superChatRevenue = {
    total: Math.round(superChatTotal * 100) / 100,
    currency: mainCurrency,
    count: superChatCount,
  };

  // Message type breakdown
  const typeBreakdown = { text: 0, paid: 0, membership: 0, sticker: 0 };
  validMessages.forEach(msg => {
    const type = msg.type || 'text';
    if (type in typeBreakdown) {
      typeBreakdown[type as keyof typeof typeBreakdown] += 1;
    }
  });

  // Average message length
  const totalLength = validMessages.reduce((sum, msg) => sum + (msg.message?.length || 0), 0);
  const averageMessageLength = totalMessages > 0 ? Math.round(totalLength / totalMessages) : 0;

  // Time range
  const timestamps = validMessages.map(m => new Date(m.timestamp).getTime());
  const firstMessageTime = Math.min(...timestamps);
  const lastMessageTime = Math.max(...timestamps);
  const durationMinutes = Math.round((lastMessageTime - firstMessageTime) / (1000 * 60));

  const timeRange = {
    firstMessage: new Date(firstMessageTime).toISOString(),
    lastMessage: new Date(lastMessageTime).toISOString(),
    durationMinutes,
  };

  // Peak activity
  const peakMinute = messageRate.reduce((max, current) =>
    current.count > max.count ? current : max,
    messageRate[0] || { timestamp: '', count: 0 }
  );

  const peakActivity = {
    timestamp: peakMinute.timestamp,
    messagesPerMinute: peakMinute.count,
  };

  return {
    totalMessages,
    uniqueUsers,
    messageRate,
    topContributors,
    superChatRevenue,
    messageTypeBreakdown: typeBreakdown,
    averageMessageLength,
    timeRange,
    peakActivity,
  };
};
