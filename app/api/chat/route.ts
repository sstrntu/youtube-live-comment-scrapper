import { NextRequest } from 'next/server';
import { Innertube, YTNodes } from 'youtubei.js';

export const runtime = 'nodejs'; // youtubei.js needs Node.js environment

function formatTimestamp(timestamp: any): string {
    if (!timestamp) {
        return new Date().toISOString();
    }

    // If it's already a valid ISO string, return it
    if (typeof timestamp === 'string' && !isNaN(Date.parse(timestamp))) {
        return timestamp;
    }

    // If it's a number, treat as milliseconds
    if (typeof timestamp === 'number') {
        return new Date(timestamp).toISOString();
    }

    // Try to parse as string
    if (typeof timestamp === 'string') {
        const parsed = new Date(timestamp).toISOString();
        if (parsed !== 'Invalid Date') {
            return parsed;
        }
    }

    // Fallback to current time
    return new Date().toISOString();
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get('videoId');

    if (!videoId) {
        return new Response('Missing videoId', { status: 400 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            let youtube: Innertube;
            let liveChat: any = null;
            let retryCount = 0;
            const MAX_RETRIES = 3; // Reduced from 5 to minimize message loss
            let lastMessageTime = Date.now();
            const STALL_TIMEOUT = 180000; // 3 minutes of no messages triggers reconnect (increased to prevent false reconnects)
            let stallCheckInterval: NodeJS.Timeout | null = null;
            let isClosed = false;
            let totalMessagesReceived = 0;

            try {
                youtube = await Innertube.create();
            } catch (err) {
                console.error("Innertube Create Error:", err);
                controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: "Failed to initialize scraper" })}\n\n`));
                controller.close();
                return;
            }

            const cleanupChat = async () => {
                if (liveChat) {
                    try {
                        await liveChat.stop();
                    } catch (e) {
                        console.error("Error stopping liveChat:", e);
                    }
                    liveChat = null;
                }
                if (stallCheckInterval) {
                    clearInterval(stallCheckInterval);
                }
            };

            const startStallCheck = () => {
                if (stallCheckInterval) clearInterval(stallCheckInterval);
                stallCheckInterval = setInterval(() => {
                    const timeSinceLastMessage = Date.now() - lastMessageTime;
                    if (timeSinceLastMessage > STALL_TIMEOUT) {
                        console.warn(`No messages for ${STALL_TIMEOUT / 1000}s. Reconnecting... (${totalMessagesReceived} messages received so far)`);
                        retryChat("stall");
                    }
                }, STALL_TIMEOUT / 2);
            };

            const retryChat = async (reason: string) => {
                if (isClosed) return;

                retryCount++;
                if (retryCount > MAX_RETRIES) {
                    console.error(`Max retries (${MAX_RETRIES}) exceeded. Stopping. Total messages received: ${totalMessagesReceived}`);
                    controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: "Connection failed after multiple retries" })}\n\n`));
                    isClosed = true;
                    await cleanupChat();
                    controller.close();
                    return;
                }

                const delayMs = Math.min(500 * Math.pow(2, retryCount - 1), 5000); // Exponential backoff, max 5s (reduced to minimize message loss)
                console.log(`Retry #${retryCount}/${MAX_RETRIES} (reason: ${reason}). Delay: ${delayMs}ms. Messages so far: ${totalMessagesReceived}`);

                await cleanupChat();
                await new Promise(resolve => setTimeout(resolve, delayMs));
                await startChat();
            };

            const startChat = async () => {
                if (isClosed) return;

                try {
                    const info = await youtube.getInfo(videoId);
                    liveChat = info.getLiveChat();

                    if (!liveChat) {
                        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: "No live chat found for this video." })}\n\n`));
                        isClosed = true;
                        controller.close();
                        return;
                    }

                    console.log(`Starting chat retrieval for video: ${videoId}`);
                    retryCount = 0; // Reset retry count on successful connection

                    liveChat.on('chat-update', (action: any) => {
                        if (isClosed) return;

                        lastMessageTime = Date.now();
                        let chatItems: YTNodes.AddChatItemAction[] = [];

                        // Standard Live AddChatItemAction
                        if (action.is(YTNodes.AddChatItemAction)) {
                            chatItems = [action.as(YTNodes.AddChatItemAction)];
                        }
                        // VOD ReplayChatItemAction
                        else if (action.is(YTNodes.ReplayChatItemAction)) {
                            const replayAction = action.as(YTNodes.ReplayChatItemAction);
                            chatItems = replayAction.actions.filter((a: any): a is YTNodes.AddChatItemAction => a.is(YTNodes.AddChatItemAction));
                        }

                        chatItems.forEach((itemAction) => {
                            const chatItem = itemAction.item;

                            let id = "";
                            let author = "Unknown";
                            let message = "";
                            let profileImageUrl = "";
                            let type = "text";
                            let timestamp = new Date().toISOString();

                            if (chatItem.is(YTNodes.LiveChatTextMessage)) {
                                const chat = chatItem.as(YTNodes.LiveChatTextMessage);
                                id = chat.id;
                                author = chat.author?.name?.toString() || "Unknown";
                                message = chat.message?.toString() || "";
                                profileImageUrl = chat.author?.thumbnails?.[0]?.url || "";
                                timestamp = formatTimestamp(chat.timestamp);
                            }
                            else if (chatItem.is(YTNodes.LiveChatPaidMessage)) {
                                const chat = chatItem.as(YTNodes.LiveChatPaidMessage);
                                id = chat.id;
                                author = chat.author?.name?.toString() || "Unknown";
                                message = `[Super Chat ${chat.purchase_amount}]: ${chat.message?.toString() || ""}`;
                                profileImageUrl = chat.author?.thumbnails?.[0]?.url || "";
                                timestamp = formatTimestamp(chat.timestamp);
                                type = "paid";
                            }
                            else if (chatItem.is(YTNodes.LiveChatMembershipItem)) {
                                const chat = chatItem.as(YTNodes.LiveChatMembershipItem);
                                id = chat.id;
                                author = chat.author?.name?.toString() || "Unknown";
                                message = `[Membership]: ${chat.header_subtext?.toString() || "Joined"}`;
                                profileImageUrl = chat.author?.thumbnails?.[0]?.url || "";
                                timestamp = formatTimestamp(chat.timestamp);
                                type = "membership";
                            }
                            else if (chatItem.is(YTNodes.LiveChatPaidSticker)) {
                                const chat = chatItem.as(YTNodes.LiveChatPaidSticker);
                                id = chat.id;
                                author = chat.author?.name?.toString() || "Unknown";
                                message = `[Paid Sticker]`;
                                profileImageUrl = chat.author?.thumbnails?.[0]?.url || "";
                                timestamp = formatTimestamp(chat.timestamp);
                                type = "sticker";
                            }

                            if (id && (message || author !== "Unknown")) {
                                const messagePayload = {
                                    id,
                                    author,
                                    message,
                                    timestamp,
                                    profileImageUrl,
                                    type,
                                    source: 'youtubei'
                                };
                                try {
                                    totalMessagesReceived++;
                                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(messagePayload)}\n\n`));
                                } catch (e) {
                                    console.error("Error enqueueing message:", e);
                                }
                            }
                        });
                    });

                    liveChat.on('error', (err: any) => {
                        if (isClosed) return;

                        console.error("LiveChat Error:", err);
                        const errorMessage = err instanceof Error ? err.message : String(err);

                        // More comprehensive error handling
                        const isNetworkError = errorMessage.includes('ECONNREFUSED') ||
                            errorMessage.includes('ECONNRESET') ||
                            errorMessage.includes('ETIMEDOUT') ||
                            errorMessage.includes('EHOSTUNREACH') ||
                            errorMessage.includes('socket');

                        const isRateLimitError = errorMessage.includes('429') ||
                            errorMessage.includes('Too Many Requests') ||
                            errorMessage.includes('quota');

                        const isFatalError = errorMessage.includes('404') ||
                            errorMessage.includes('Invalid') ||
                            errorMessage.includes('Unauthorized') ||
                            errorMessage.includes('status code 400');

                        if (isNetworkError || isRateLimitError || errorMessage.includes('Failed to fetch')) {
                            retryChat(errorMessage.substring(0, 50));
                        } else if (isFatalError) {
                            console.error(`Chat replay complete or unavailable: ${errorMessage}`);
                            controller.enqueue(encoder.encode(`event: end\ndata: ${JSON.stringify({ message: "Chat retrieval complete" })}\n\n`));
                            isClosed = true;
                            cleanupChat();
                            controller.close();
                        } else {
                            // Retry unknown errors as well (safer than giving up)
                            retryChat(errorMessage.substring(0, 50));
                        }
                    });

                    liveChat.on('end', () => {
                        if (!isClosed) {
                            console.log(`Chat ended. Total messages received: ${totalMessagesReceived}`);
                            controller.enqueue(encoder.encode(`event: end\ndata: ${JSON.stringify({ message: "Chat ended" })}\n\n`));
                            isClosed = true;
                            cleanupChat();
                            controller.close();
                        }
                    });

                    startStallCheck();
                    await liveChat.start();
                } catch (err: unknown) {
                    if (isClosed) return;

                    console.error("StartChat Error:", err);
                    const message = err instanceof Error ? err.message : "An unexpected error occurred";

                    // Treat as retryable error
                    retryChat(message.substring(0, 50));
                }
            };

            await startChat();

        },
        cancel() {
            console.log("Stream cancelled by client");
            // Cleanup will happen when the controller closes
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
