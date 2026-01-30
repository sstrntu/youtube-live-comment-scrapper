import { ChatMessage, TopicCluster } from './youtube';

/**
 * Analyze topics using OpenAI's GPT-4o-mini model
 * Requires OPENAI_API_KEY environment variable
 */
export const analyzeTopicsWithAI = async (
  messages: ChatMessage[]
): Promise<{
  topics: string[];
  themes: TopicCluster[];
  summary: string;
}> => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured in environment variables');
  }

  if (messages.length === 0) {
    return { topics: [], themes: [], summary: '' };
  }

  try {
    // Prepare chat messages for analysis (limit to reasonable size)
    const sampleSize = Math.min(500, messages.length);
    const sampleMessages = messages.slice(-sampleSize);

    // Create message content for AI analysis
    const messageTexts = sampleMessages
      .map(m => `${m.author}: ${m.message}`)
      .join('\n');

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert at analyzing live chat conversations.
Extract the main topics/themes being discussed. Return a JSON object with:
{
  "topics": ["topic1", "topic2", ...],
  "themes": [
    {
      "topic": "theme name",
      "description": "brief description",
      "keywords": ["key1", "key2"]
    }
  ],
  "summary": "brief overall summary of chat themes"
}

Be concise. Return valid JSON only, no markdown.`,
          },
          {
            role: 'user',
            content: `Analyze this live chat and identify main topics:\n\n${messageTexts}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse the JSON response
    const analysisResult = JSON.parse(content);

    // Convert themes to TopicCluster format
    const themes: TopicCluster[] = (analysisResult.themes || []).map(
      (theme: {
        topic: string;
        description?: string;
        keywords?: string[];
      }) => {
        // Find messages that relate to this topic
        const relatedMessages = sampleMessages.filter(msg => {
          const text = msg.message.toLowerCase();
          const keywords = theme.keywords || [];
          return keywords.some(kw => text.includes(kw.toLowerCase()));
        });

        const contributors = Array.from(new Set(relatedMessages.map(m => m.author)));
        const timestamps = relatedMessages.map(m => new Date(m.timestamp).getTime());

        return {
          topic: theme.topic,
          keywords: theme.keywords || [theme.topic],
          messageCount: relatedMessages.length,
          topContributors: contributors.slice(0, 5),
          timeRange: {
            start: new Date(Math.min(...timestamps)).toISOString(),
            end: new Date(Math.max(...timestamps)).toISOString(),
          },
        };
      }
    );

    return {
      topics: analysisResult.topics || [],
      themes,
      summary: analysisResult.summary || '',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`AI topic analysis failed: ${errorMessage}`);
  }
};

/**
 * Generate a chat summary using AI
 */
export const generateChatSummary = async (
  messages: ChatMessage[]
): Promise<string> => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const sampleSize = Math.min(200, messages.length);
  const sampleMessages = messages.slice(-sampleSize);

  const messageTexts = sampleMessages
    .map(m => `${m.author}: ${m.message}`)
    .join('\n');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at summarizing live chat discussions. Provide a concise 2-3 sentence summary of the main points discussed.',
          },
          {
            role: 'user',
            content: `Summarize this live chat:\n\n${messageTexts}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      throw new Error('OpenAI API error');
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || 'No summary available';
  } catch (error) {
    console.error('Summary generation error:', error);
    return 'Unable to generate summary';
  }
};
