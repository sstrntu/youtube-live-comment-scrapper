import { NextRequest, NextResponse } from 'next/server';
import { ChatMessage, TopicCluster } from '../../../utils/youtube';

export const runtime = 'nodejs';

/**
 * API route for AI-powered topic analysis using GPT-4o-mini
 * POST /api/analyze-topics
 */
export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json() as { messages: ChatMessage[] };

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'No messages provided' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('OPENAI_API_KEY not configured');
      return NextResponse.json(
        { topics: [], themes: [], summary: '', error: 'AI key not configured' },
        { status: 200 } // Return 200 with empty results so fallback works
      );
    }

    // Sample messages to avoid token limits
    const sampleSize = Math.min(500, messages.length);
    const sampleMessages = messages.slice(-sampleSize);

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
      console.error('OpenAI API error:', error);
      return NextResponse.json(
        { topics: [], themes: [], summary: '', error: 'OpenAI API error' },
        { status: 200 } // Return 200 so fallback works
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.warn('No content in OpenAI response');
      return NextResponse.json(
        { topics: [], themes: [], summary: '', error: 'No response content' },
        { status: 200 }
      );
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

    return NextResponse.json({
      topics: analysisResult.topics || [],
      themes,
      summary: analysisResult.summary || '',
    });
  } catch (error) {
    console.error('Topic analysis error:', error);
    // Return empty results so keyword fallback works
    return NextResponse.json({
      topics: [],
      themes: [],
      summary: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
