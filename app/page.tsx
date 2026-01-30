"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { ChatMessage, getVideoId, InsightData, EngagementAnalysis } from "../utils/youtube";
import { exportToCSV, exportToJSON } from "../utils/export";
import { calculateInsights } from "../utils/analytics";
import { analyzeEngagement } from "../utils/engagementAnalytics";
import InsightsPanel from "./components/InsightsPanel";
import EngagementPanel from "./components/EngagementPanel";

export default function Home() {
  const [videoUrl, setVideoUrl] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrapingMethod, setScrapingMethod] = useState<'youtubei' | 'api' | 'both'>('api');
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const [apiMessages, setApiMessages] = useState<ChatMessage[]>([]);
  const [useBatchMode, setUseBatchMode] = useState(false);
  const [batchPollingInterval, setBatchPollingInterval] = useState<number | string>(30); // seconds
  const [batchAutoStopMinutes, setBatchAutoStopMinutes] = useState<number | string>(5); // minutes after last message
  const [lastMessageTimeRef, setLastMessageTime] = useState<number>(0);
  const [estimatedQuotaUsage, setEstimatedQuotaUsage] = useState(0);

  // Engagement analysis state
  const [engagementAnalysis, setEngagementAnalysis] = useState<EngagementAnalysis | null>(null);
  const [showEngagementPanel, setShowEngagementPanel] = useState(false);
  const [hostName, setHostName] = useState("");
  const [useAITopics, setUseAITopics] = useState(false);
  const [openAIKey, setOpenAIKey] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const apiEventSourceRef = useRef<EventSource | null>(null);
  const insightsDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom of chat
  const chatContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);


  // Calculate quota when batch settings change
  useEffect(() => {
    if (useBatchMode) {
      calculateEstimatedQuota(batchPollingInterval, 110); // Default 110 min stream
    }
  }, [batchPollingInterval, batchAutoStopMinutes, useBatchMode]);

  // Real-time insights calculation with debounce
  useEffect(() => {
    if (insightsDebounceRef.current) {
      clearTimeout(insightsDebounceRef.current);
    }

    insightsDebounceRef.current = setTimeout(() => {
      const allMessages = scrapingMethod === 'both' ? [...messages, ...apiMessages] : messages;
      if (allMessages.length > 0) {
        const newInsights = calculateInsights(allMessages);
        setInsights(newInsights);
      }
    }, 500);

    return () => {
      if (insightsDebounceRef.current) {
        clearTimeout(insightsDebounceRef.current);
      }
    };
  }, [messages, apiMessages, scrapingMethod]);

  const calculateEstimatedQuota = (intervalSecs: number | string, durationMins: number) => {
    const interval = typeof intervalSecs === 'string' ? parseInt(intervalSecs) || 30 : intervalSecs;
    // Each polling cycle = 2 API calls (getLiveChatId + fetchChatMessages)
    // Plus some extra for retries
    const pollsPerMinute = 60 / interval;
    const totalPolls = pollsPerMinute * durationMins;
    const estimatedCalls = totalPolls * 2 * 1.2; // 20% buffer for retries
    setEstimatedQuotaUsage(Math.ceil(estimatedCalls));
  };

  const handleStartScraping = async () => {
    if (scrapingMethod === 'youtubei') {
      await handleStartScrapingYoutubei();
    } else if (scrapingMethod === 'api') {
      if (useBatchMode) {
        await handleStartScrapingBatch();
      } else {
        await handleStartScrapingApi();
      }
    } else if (scrapingMethod === 'both') {
      await handleStartScrapingBoth();
    }
  };

  const handleStartScrapingYoutubei = async () => {
    setError(null);
    setMessages([]);

    const videoId = getVideoId(videoUrl);
    if (!videoId) {
      setError("Invalid YouTube Video URL.");
      return;
    }

    try {
      setIsScraping(true);

      // Close existing connection if any
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = `/api/chat?videoId=${videoId}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setMessages((prev) => {
          // Prevent duplicates (especially common in VOD replay streams)
          if (prev.some(m => m.id === data.id)) return prev;
          return [...prev, { ...data, source: data.source || 'youtubei' }];
        });
      };

      es.onerror = (e) => {
        console.error("EventSource Error:", e);
      };

      es.addEventListener('error', (event) => {
        const errorEvent = event as MessageEvent;
        if (errorEvent.data) {
          const errorData = JSON.parse(errorEvent.data);
          setError(errorData.message || "Failed to fetch chat.");
          es.close();
          setIsScraping(false);
        }
      });

      es.addEventListener('end', () => {
        es.close();
        setIsScraping(false);
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to start scraping.";
      setError(errorMessage);
      setIsScraping(false);
    }
  };

  const handleStartScrapingApi = async () => {
    setError(null);
    setMessages([]);

    const videoId = getVideoId(videoUrl);
    if (!videoId) {
      setError("Invalid YouTube Video URL.");
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
    if (!apiKey) {
      setError("YouTube Data API key is not configured.");
      return;
    }

    try {
      setIsScraping(true);

      // Close existing connection if any
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = `/api/chat-api?videoId=${videoId}&apiKey=${encodeURIComponent(apiKey)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setMessages((prev) => {
          if (prev.some(m => m.id === data.id)) return prev;
          return [...prev, { ...data, source: data.source || 'api' }];
        });
      };

      es.onerror = (e) => {
        console.error("EventSource Error:", e);
      };

      es.addEventListener('error', (event) => {
        const errorEvent = event as MessageEvent;
        if (errorEvent.data) {
          const errorData = JSON.parse(errorEvent.data);
          setError(errorData.message || "Failed to fetch chat.");
          es.close();
          setIsScraping(false);
        }
      });

      es.addEventListener('end', () => {
        es.close();
        setIsScraping(false);
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to start scraping.";
      setError(errorMessage);
      setIsScraping(false);
    }
  };

  const handleStartScrapingBoth = async () => {
    setError(null);
    setMessages([]);
    setApiMessages([]);

    const videoId = getVideoId(videoUrl);
    if (!videoId) {
      setError("Invalid YouTube Video URL.");
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
    if (!apiKey) {
      setError("YouTube Data API key is not configured.");
      return;
    }

    try {
      setIsScraping(true);

      // Close existing connections
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (apiEventSourceRef.current) apiEventSourceRef.current.close();

      // Start youtubei.js stream
      const youtubeUrl = `/api/chat?videoId=${videoId}`;
      const youtubeEs = new EventSource(youtubeUrl);
      eventSourceRef.current = youtubeEs;

      youtubeEs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setMessages((prev) => {
          if (prev.some(m => m.id === data.id)) return prev;
          return [...prev, { ...data, source: data.source || 'youtubei' }];
        });
      };

      youtubeEs.addEventListener('error', (event) => {
        const errorEvent = event as MessageEvent;
        if (errorEvent.data) {
          const errorData = JSON.parse(errorEvent.data);
          setError(errorData.message || "Failed to fetch chat (youtubei.js).");
          youtubeEs.close();
        }
      });

      // Start API stream
      const apiUrl = `/api/chat-api?videoId=${videoId}&apiKey=${encodeURIComponent(apiKey)}`;
      const apiEs = new EventSource(apiUrl);
      apiEventSourceRef.current = apiEs;

      apiEs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setApiMessages((prev) => {
          if (prev.some(m => m.id === data.id)) return prev;
          return [...prev, { ...data, source: data.source || 'api' }];
        });
      };

      apiEs.addEventListener('error', (event) => {
        const errorEvent = event as MessageEvent;
        if (errorEvent.data) {
          const errorData = JSON.parse(errorEvent.data);
          // Don't stop scraping for API errors in dual mode
          console.error("API error:", errorData.message);
        }
      });

      // Check if both streams have ended
      let youtubeEnded = false;
      let apiEnded = false;

      youtubeEs.addEventListener('end', () => {
        youtubeEnded = true;
        if (apiEnded) {
          youtubeEs.close();
          apiEs.close();
          setIsScraping(false);
        }
      });

      apiEs.addEventListener('end', () => {
        apiEnded = true;
        if (youtubeEnded) {
          youtubeEs.close();
          apiEs.close();
          setIsScraping(false);
        }
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to start dual scraping.";
      setError(errorMessage);
      setIsScraping(false);
    }
  };

  const handleStartScrapingBatch = async () => {
    setError(null);
    setMessages([]);
    setLastMessageTime(Date.now());

    const videoId = getVideoId(videoUrl);
    if (!videoId) {
      setError("Invalid YouTube Video URL.");
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
    if (!apiKey) {
      setError("YouTube Data API key is not configured.");
      return;
    }

    try {
      setIsScraping(true);

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Pass polling interval as query parameter
      const pollingIntervalMs = (typeof batchPollingInterval === 'string' ? parseInt(batchPollingInterval) || 30 : batchPollingInterval) * 1000;
      const autoStopMin = typeof batchAutoStopMinutes === 'string' ? parseInt(batchAutoStopMinutes) || 5 : batchAutoStopMinutes;
      const url = `/api/chat-api?videoId=${videoId}&apiKey=${encodeURIComponent(apiKey)}&pollingInterval=${pollingIntervalMs}&autoStopMinutes=${autoStopMin}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setMessages((prev) => {
          if (prev.some(m => m.id === data.id)) return prev;
          return [...prev, { ...data, source: data.source || 'api' }];
        });
        setLastMessageTime(Date.now());
      };

      es.onerror = (e) => {
        console.error("EventSource Error:", e);
      };

      es.addEventListener('error', (event) => {
        const errorEvent = event as MessageEvent;
        if (errorEvent.data) {
          const errorData = JSON.parse(errorEvent.data);
          setError(errorData.message || "Failed to fetch chat.");
          es.close();
          setIsScraping(false);
        }
      });

      es.addEventListener('end', () => {
        es.close();
        setIsScraping(false);
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to start batch scraping.";
      setError(errorMessage);
      setIsScraping(false);
    }
  };

  const handleStopScraping = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (apiEventSourceRef.current) {
      apiEventSourceRef.current.close();
      apiEventSourceRef.current = null;
    }
    setIsScraping(false);
  };


  const handleClearMessages = () => {
    setMessages([]);
    setApiMessages([]);
    setInsights(null);
    setEngagementAnalysis(null);
    setShowEngagementPanel(false);
  };

  const handleAnalyzeEngagement = async () => {
    setAnalysisError(null);
    setIsAnalyzing(true);

    try {
      const allMessages = scrapingMethod === 'both' ? [...messages, ...apiMessages] : messages;

      if (allMessages.length === 0) {
        setAnalysisError("No messages to analyze. Start scraping first.");
        setIsAnalyzing(false);
        return;
      }

      if (allMessages.length < 50) {
        setAnalysisError("Need at least 50 messages for meaningful analysis.");
        setIsAnalyzing(false);
        return;
      }

      const analysis = analyzeEngagement(
        allMessages,
        hostName || undefined,
        useAITopics && openAIKey ? true : undefined
      );

      setEngagementAnalysis(analysis);
      setShowEngagementPanel(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
      setAnalysisError(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (apiEventSourceRef.current) {
        apiEventSourceRef.current.close();
      }
      if (insightsDebounceRef.current) {
        clearTimeout(insightsDebounceRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 p-8 font-sans">
      <main className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-red-600 dark:text-red-500">
            YouTube Live Scraper
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Real-time chat extraction for Analysis (Live & VOD Replay).
          </p>
        </div>

        {/* Method Selection Card */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg p-6 space-y-4 border border-gray-100 dark:border-zinc-700">
          <h2 className="text-lg font-semibold">Scraping Method</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-zinc-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors">
              <input
                type="radio"
                value="youtubei"
                checked={scrapingMethod === 'youtubei'}
                onChange={(e) => setScrapingMethod(e.target.value as 'youtubei' | 'api' | 'both')}
                disabled={isScraping}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium text-sm">youtubei.js</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Live & VOD replays (fragile)</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-green-500 dark:border-green-600 cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors bg-green-50/50 dark:bg-green-900/10">
              <input
                type="radio"
                value="api"
                checked={scrapingMethod === 'api'}
                onChange={(e) => setScrapingMethod(e.target.value as 'youtubei' | 'api' | 'both')}
                disabled={isScraping}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium text-sm text-green-700 dark:text-green-400">YouTube Data API ✓</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Live only, stable & reliable</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-zinc-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors">
              <input
                type="radio"
                value="both"
                checked={scrapingMethod === 'both'}
                onChange={(e) => setScrapingMethod(e.target.value as 'youtubei' | 'api' | 'both')}
                disabled={isScraping}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium text-sm">Both Methods</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Dual parallel scraping</div>
              </div>
            </label>
          </div>

          <p className="text-xs text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-zinc-600 pt-3">
            <strong>Recommended:</strong> Use YouTube Data API for complete and accurate chat capture. Only use youtubei.js if you need VOD replay support.
          </p>

          {scrapingMethod === 'api' && (
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-900/50 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useBatchMode}
                  onChange={(e) => setUseBatchMode(e.target.checked)}
                  disabled={isScraping}
                  className="w-4 h-4 cursor-pointer"
                />
                <span className="text-sm font-medium">Use Batch Capture Mode ⚡</span>
              </label>
              <p className="text-xs text-gray-600 dark:text-gray-400">Capture all messages from 90-120 min streams with minimal API quota usage</p>

              {useBatchMode && (
                <div className="space-y-4 pt-2 border-t border-green-200 dark:border-green-900/50">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-medium">Polling Interval (seconds)</label>
                      <input
                        type="number"
                        value={batchPollingInterval}
                        onChange={(e) => setBatchPollingInterval(e.target.value === '' ? '' : parseInt(e.target.value) || 30)}
                        onBlur={(e) => {
                          if (e.target.value === '') {
                            setBatchPollingInterval(30);
                          }
                        }}
                        disabled={isScraping}
                        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-green-500 outline-none transition-all"
                      />
                      <p className="text-xs text-gray-600 dark:text-gray-400">Poll every {typeof batchPollingInterval === 'number' ? batchPollingInterval : 30}s</p>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-medium">Auto-Stop After (minutes)</label>
                      <input
                        type="number"
                        value={batchAutoStopMinutes}
                        onChange={(e) => setBatchAutoStopMinutes(e.target.value === '' ? '' : parseInt(e.target.value) || 5)}
                        onBlur={(e) => {
                          if (e.target.value === '') {
                            setBatchAutoStopMinutes(5);
                          }
                        }}
                        disabled={isScraping}
                        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-green-500 outline-none transition-all"
                      />
                      <p className="text-xs text-gray-600 dark:text-gray-400">Stop {typeof batchAutoStopMinutes === 'number' ? batchAutoStopMinutes : 5}m after last message</p>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 rounded p-3 border border-green-100 dark:border-green-900/30">
                    <p className="text-xs font-medium mb-2">Estimated API Quota Usage:</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-green-600 dark:text-green-400">{estimatedQuotaUsage}</span>
                      <span className="text-xs text-gray-600 dark:text-gray-400">units / 10,000 daily limit</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                      For a 110-minute stream at {batchPollingInterval}s intervals
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Configuration Card */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg p-6 space-y-4 border border-gray-100 dark:border-zinc-700">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label htmlFor="videoUrl" className="block text-sm font-medium">
                YouTube Video URL
              </label>
              <input
                id="videoUrl"
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or https://youtube.com/live/..."
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-red-500 outline-none transition-all"
                disabled={isScraping}
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            {!isScraping ? (
              <button
                onClick={handleStartScraping}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors shadow-sm"
              >
                Start Scraping
              </button>
            ) : (
              <button
                onClick={handleStopScraping}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors shadow-sm"
              >
                Stop Scraping
              </button>
            )}

            <button
              onClick={handleClearMessages}
              disabled={messages.length === 0}
              className="px-4 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 hover:bg-gray-50 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear Messages
            </button>
          </div>
        </div>

        {/* Engagement Analysis Settings */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg p-6 space-y-4 border border-gray-100 dark:border-zinc-700">
          <h2 className="text-lg font-semibold">Community Engagement Analysis</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Advanced analytics to identify question answerers, trending topics, active members, and conversation threads.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="hostName" className="block text-sm font-medium">
                Host Name (Optional)
              </label>
              <input
                id="hostName"
                type="text"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="e.g., Channel Owner"
                disabled={isAnalyzing}
                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Leave empty for automatic detection by badges or message frequency
              </p>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAITopics}
                  onChange={(e) => setUseAITopics(e.target.checked)}
                  disabled={isAnalyzing}
                  className="w-4 h-4 cursor-pointer"
                />
                <span className="text-sm font-medium">Use AI Topic Analysis</span>
              </label>
            </div>
          </div>

          {useAITopics && (
            <div className="space-y-2">
              <label htmlFor="openAIKey" className="block text-sm font-medium">
                OpenAI API Key
              </label>
              <input
                id="openAIKey"
                type="password"
                value={openAIKey}
                onChange={(e) => setOpenAIKey(e.target.value)}
                placeholder="sk-..."
                disabled={isAnalyzing}
                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Warning: AI analysis will incur API costs. Leave empty to use keyword analysis only.
              </p>
            </div>
          )}

          {analysisError && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {analysisError}
            </div>
          )}

          <button
            onClick={handleAnalyzeEngagement}
            disabled={
              isAnalyzing ||
              (scrapingMethod === 'both' ? messages.length + apiMessages.length : messages.length) < 50
            }
            className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin inline-flex h-4 w-4 rounded-full border-2 border-white border-t-transparent"></span>
                Analyzing...
              </span>
            ) : (
              "Analyze Engagement"
            )}
          </button>
        </div>

        {/* Stats & Tools */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{scrapingMethod === 'both' ? messages.length + apiMessages.length : messages.length}</span>
              <span className="text-gray-500 dark:text-gray-400">Total Messages</span>
              {isScraping && (
                <span className="ml-2 flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowInsights(!showInsights)}
                disabled={insights === null}
                className="px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {showInsights ? 'Hide' : 'Show'} Insights
              </button>
              <button
                onClick={() => setShowEngagementPanel(!showEngagementPanel)}
                disabled={engagementAnalysis === null}
                className="px-4 py-2 text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {showEngagementPanel ? 'Hide' : 'Show'} Engagement
              </button>
              <button
                onClick={() => exportToCSV(scrapingMethod === 'both' ? [...messages, ...apiMessages] : messages)}
                disabled={messages.length === 0 && apiMessages.length === 0}
                className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Export CSV
              </button>
              <button
                onClick={() => exportToJSON(scrapingMethod === 'both' ? [...messages, ...apiMessages] : messages)}
                disabled={messages.length === 0 && apiMessages.length === 0}
                className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Export JSON
              </button>
            </div>
          </div>

          {/* Insights Panel */}
          {showInsights && insights && (
            <InsightsPanel insights={insights} />
          )}

          {/* Engagement Analysis Panel */}
          {showEngagementPanel && engagementAnalysis && (
            <EngagementPanel
              analysis={engagementAnalysis}
              messages={scrapingMethod === 'both' ? [...messages, ...apiMessages] : messages}
            />
          )}
        </div>

        {/* Chat Display */}
        <div
          ref={chatContainerRef}
          className="bg-white dark:bg-zinc-800 rounded-xl shadow-inner border border-gray-200 dark:border-zinc-700 h-[500px] overflow-y-auto p-4 space-y-4"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-zinc-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-2 opacity-50">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
              <p>No messages yet. Start scraping to see chat.</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="flex gap-3 hover:bg-gray-50 dark:hover:bg-zinc-700/50 p-2 rounded-lg transition-colors">
                <div className="flex-shrink-0">
                  {msg.profileImageUrl ? (
                    <div className="relative w-8 h-8 rounded-full overflow-hidden bg-gray-200">
                      <Image
                        src={msg.profileImageUrl}
                        alt={msg.author}
                        fill
                        className="object-cover"
                        referrerPolicy="no-referrer"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-zinc-600 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-300">
                      {msg.author.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm truncate text-gray-900 dark:text-gray-100">
                      {msg.author}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(msg.timestamp).toLocaleTimeString() === 'Invalid Date' ? 'Unknown time' : new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 break-words leading-relaxed">
                    {msg.message}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
