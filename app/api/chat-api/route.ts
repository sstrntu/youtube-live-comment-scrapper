import { NextRequest } from 'next/server';
import { getLiveChatId, fetchChatMessages } from '@/utils/youtube';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get('videoId');
  const apiKey = searchParams.get('apiKey');
  const customPollingIntervalMs = parseInt(searchParams.get('pollingInterval') || '5000'); // milliseconds
  const autoStopMinutes = parseInt(searchParams.get('autoStopMinutes') || '5'); // minutes without new messages

  if (!videoId) {
    return new Response('Missing videoId', { status: 400 });
  }

  if (!apiKey) {
    return new Response('Missing apiKey', { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      let pollingInterval: NodeJS.Timeout | null = null;
      let autoStopCheckInterval: NodeJS.Timeout | null = null;
      let liveChatId: string | null = null;
      let nextPageToken: string | null = null;
      let retryCount = 0;
      let lastMessageTime = Date.now();
      let messageCountInLastPoll = 0;
      const MAX_RETRIES = 3;
      const AUTO_STOP_MS = autoStopMinutes * 60 * 1000;

      const cleanup = () => {
        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
        if (autoStopCheckInterval) {
          clearInterval(autoStopCheckInterval);
          autoStopCheckInterval = null;
        }
      };

      const closeStream = (errorMessage: string | null = null) => {
        if (isClosed) return;
        isClosed = true;
        cleanup();

        try {
          if (errorMessage) {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({ message: errorMessage })}\n\n`
              )
            );
          }
          controller.close();
        } catch (e) {
          console.error('Error closing stream:', e);
        }
      };

      const startAutoStopCheck = () => {
        if (autoStopCheckInterval) clearInterval(autoStopCheckInterval);
        autoStopCheckInterval = setInterval(() => {
          const timeSinceLastMessage = Date.now() - lastMessageTime;
          if (timeSinceLastMessage > AUTO_STOP_MS) {
            console.log(`No new messages for ${autoStopMinutes} minutes. Auto-stopping batch capture.`);
            closeStream();
          }
        }, 10000); // Check every 10 seconds
      };

      const retryPolling = async (reason: string) => {
        if (isClosed) return;

        retryCount++;
        if (retryCount > MAX_RETRIES) {
          console.error(`Max retries (${MAX_RETRIES}) exceeded for API method. Stopping.`);
          closeStream('Connection failed after multiple retries');
          return;
        }

        const delayMs = Math.min(500 * Math.pow(2, retryCount - 1), 5000);
        console.log(`API Retry #${retryCount}/${MAX_RETRIES} (reason: ${reason}). Waiting ${delayMs}ms...`);

        await new Promise(resolve => setTimeout(resolve, delayMs));
        await startPolling();
      };

      const startPolling = async () => {
        if (isClosed) {
          cleanup();
          return;
        }

        try {
          // Get live chat ID if not already obtained
          if (!liveChatId) {
            try {
              liveChatId = await getLiveChatId(apiKey, videoId);
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : 'Failed to get live chat ID';
              console.error('getLiveChatId Error:', errorMessage);

              // Check if it's a VOD error
              if (errorMessage.includes('This live stream has ended') || errorMessage.includes('no active live chat')) {
                closeStream('YouTube Data API only works with LIVE streams, not replays. Use the youtubei.js method for VOD replays.');
                return;
              }

              // Retry for other errors
              await retryPolling(errorMessage.substring(0, 50));
              return;
            }
          }

          // Fetch messages
          const response = await fetchChatMessages(apiKey, liveChatId, nextPageToken || undefined);
          nextPageToken = response.nextPageToken;
          retryCount = 0; // Reset retry count on successful fetch

          // Send messages
          messageCountInLastPoll = response.messages.length;
          for (const msg of response.messages) {
            if (isClosed) break;

            const messagePayload = {
              ...msg,
              source: 'api',
            };

            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(messagePayload)}\n\n`));
              lastMessageTime = Date.now(); // Update last message time
            } catch (e) {
              if (e instanceof Error && e.message.includes('Controller is already closed')) {
                console.log('Stream closed, stopping message delivery');
                isClosed = true;
                cleanup();
                break;
              }
              console.error('Error enqueueing message:', e);
            }
          }

          // Start auto-stop check if we got messages and it's not already running
          if (messageCountInLastPoll > 0 && !autoStopCheckInterval) {
            startAutoStopCheck();
          }

          // Schedule next poll (only if not closed)
          if (!isClosed) {
            // Use custom polling interval if provided, otherwise use API's recommended interval
            const nextPollingIntervalMs = customPollingIntervalMs > 0 ? customPollingIntervalMs : (response.pollingIntervalMillis || 5000);
            if (pollingInterval) clearInterval(pollingInterval);
            pollingInterval = setTimeout(() => {
              startPolling();
            }, nextPollingIntervalMs);
          }

        } catch (err: unknown) {
          if (isClosed) return;

          console.error('Polling Error:', err);
          const message = err instanceof Error ? err.message : 'An unexpected error occurred';

          // Check for quota exceeded
          if (message.includes('quota') || message.includes('403')) {
            closeStream('YouTube API quota exceeded. Fall back to youtubei.js method or try again later.');
            return;
          }

          // Retry for other errors
          await retryPolling(message.substring(0, 50));
        }
      };

      await startPolling();

      // Cleanup on client disconnect
      setTimeout(() => {
        if (!isClosed) {
          cleanup();
          isClosed = true;
          controller.close();
        }
      }, 3600000); // 1 hour timeout
    },

    cancel() {
      console.log('Stream cancelled by client');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
