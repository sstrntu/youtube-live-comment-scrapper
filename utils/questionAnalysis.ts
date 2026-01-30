import { ChatMessage, HostQuestion, Answer, QuestionAnswerer } from './youtube';

/**
 * Detect if a message contains a question
 * Uses regex patterns for common question indicators
 */
export const detectQuestions = (message: string): boolean => {
  if (!message || message.length < 5) {
    return false;
  }

  // Check for question mark
  if (message.includes('?')) {
    return true;
  }

  // Check for common question words at the beginning (case insensitive)
  const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does'];
  const lowerMessage = message.toLowerCase().trim();

  for (const word of questionWords) {
    if (lowerMessage.startsWith(word + ' ')) {
      return true;
    }
  }

  return false;
};

/**
 * Find answers to a host question within a time window
 * Temporal proximity: messages within 2 min after question (configurable)
 * Exclude host's own follow-up messages
 */
export const findAnswers = (
  question: HostQuestion,
  messages: ChatMessage[],
  hostName: string,
  timeWindowSeconds: number = 120
): Answer[] => {
  const questionTime = new Date(question.timestamp).getTime();
  const answers: Answer[] = [];

  // Filter messages that come after the question
  const candidateMessages = messages.filter(msg => {
    const msgTime = new Date(msg.timestamp).getTime();
    const timeDiffSeconds = (msgTime - questionTime) / 1000;

    // Message must be after question and within time window
    return (
      timeDiffSeconds > 0 &&
      timeDiffSeconds <= timeWindowSeconds &&
      msg.author !== question.author && // Exclude host's follow-ups
      msg.author !== question.author // Don't include the questioner's replies
    );
  });

  // Sort by timestamp to get chronological order
  candidateMessages.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Limit to top 10 answers
  const topAnswers = candidateMessages.slice(0, 10);

  topAnswers.forEach(msg => {
    const responseTime = (new Date(msg.timestamp).getTime() - questionTime) / 1000;
    answers.push({
      messageId: msg.id,
      author: msg.author,
      message: msg.message,
      timestamp: msg.timestamp,
      responseTimeSeconds: responseTime,
    });
  });

  return answers;
};

/**
 * Extract host questions and their answers
 */
export const extractHostQuestions = (
  messages: ChatMessage[],
  hostName: string,
  timeWindowSeconds: number = 120
): HostQuestion[] => {
  const hostMessages = messages.filter(msg => msg.author === hostName);
  const hostQuestions: HostQuestion[] = [];

  hostMessages.forEach(msg => {
    if (detectQuestions(msg.message)) {
      const answers = findAnswers(
        {
          messageId: msg.id,
          author: msg.author,
          question: msg.message,
          timestamp: msg.timestamp,
          answers: [],
          wasAnswered: false,
        },
        messages,
        hostName,
        timeWindowSeconds
      );

      hostQuestions.push({
        messageId: msg.id,
        author: msg.author,
        question: msg.message,
        timestamp: msg.timestamp,
        answers,
        wasAnswered: answers.length > 0,
      });
    }
  });

  return hostQuestions;
};

/**
 * Find answers to a specific question text
 * Useful for filtering a specific host question
 */
export const findAnswersToSpecificQuestion = (
  questionText: string,
  messages: ChatMessage[],
  hostName: string,
  timeWindowSeconds: number = 120
): {
  question: HostQuestion;
  answerCount: number;
  topAnswerers: QuestionAnswerer[];
} => {
  // Find the message that matches the question (approximate match)
  const questionMsg = messages.find(msg =>
    msg.author === hostName &&
    msg.message.toLowerCase().includes(questionText.toLowerCase())
  );

  if (!questionMsg) {
    return {
      question: {
        messageId: '',
        author: hostName,
        question: questionText,
        timestamp: new Date().toISOString(),
        answers: [],
        wasAnswered: false,
      },
      answerCount: 0,
      topAnswerers: [],
    };
  }

  const answers = findAnswers(
    {
      messageId: questionMsg.id,
      author: questionMsg.author,
      question: questionMsg.message,
      timestamp: questionMsg.timestamp,
      answers: [],
      wasAnswered: false,
    },
    messages,
    hostName,
    timeWindowSeconds
  );

  // Create a temporary HostQuestion for scoring
  const tempQuestion: HostQuestion = {
    messageId: questionMsg.id,
    author: questionMsg.author,
    question: questionMsg.message,
    timestamp: questionMsg.timestamp,
    answers,
    wasAnswered: answers.length > 0,
  };

  // Score the answerers
  const answerers = rankQuestionAnswerers([tempQuestion], messages);

  return {
    question: tempQuestion,
    answerCount: answers.length,
    topAnswerers: answerers.slice(0, 10),
  };
};

/**
 * Rank question answerers by helpfulness
 * Score based on: frequency, response time, answer quality
 */
export const rankQuestionAnswerers = (
  hostQuestions: HostQuestion[],
  messages: ChatMessage[]
): QuestionAnswerer[] => {
  const answererMap = new Map<string, {
    answersCount: number;
    totalResponseTime: number;
    respondentMessages: number;
  }>();

  // Collect statistics from all answers
  hostQuestions.forEach(question => {
    question.answers.forEach(answer => {
      const author = answer.author;

      if (!answererMap.has(author)) {
        const authorMessages = messages.filter(m => m.author === author);
        answererMap.set(author, {
          answersCount: 0,
          totalResponseTime: 0,
          respondentMessages: authorMessages.length,
        });
      }

      const stats = answererMap.get(author)!;
      stats.answersCount += 1;
      stats.totalResponseTime += answer.responseTimeSeconds;
    });
  });

  // Convert to QuestionAnswerer array
  const answerers: QuestionAnswerer[] = [];
  const profileImageMap = new Map<string, string>();

  // Build profile image map
  messages.forEach(msg => {
    if (!profileImageMap.has(msg.author)) {
      profileImageMap.set(msg.author, msg.profileImageUrl);
    }
  });

  answererMap.forEach((stats, author) => {
    const avgResponseTime = stats.answersCount > 0
      ? stats.totalResponseTime / stats.answersCount
      : 0;

    // Helpfulness score: weighted combination
    // - Frequency (answers per 100 messages): 40%
    // - Speed (inverse of response time, normalized): 40%
    // - Engagement (answer percentage): 20%
    const frequencyScore = Math.min(100, (stats.answersCount / Math.max(1, stats.respondentMessages)) * 100);
    const speedScore = Math.max(0, 100 - (avgResponseTime / 60) * 10); // Penalize slow responses
    const engagementScore = (stats.answersCount / hostQuestions.length) * 100;

    const helpfulnessScore =
      (frequencyScore * 0.4) +
      (speedScore * 0.4) +
      (engagementScore * 0.2);

    answerers.push({
      author,
      profileImageUrl: profileImageMap.get(author) || '',
      questionsAnswered: stats.answersCount,
      averageResponseTime: avgResponseTime,
      helpfulnessScore: Math.round(helpfulnessScore),
    });
  });

  // Sort by helpfulness score
  answerers.sort((a, b) => b.helpfulnessScore - a.helpfulnessScore);

  return answerers;
};
