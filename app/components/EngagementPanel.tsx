"use client";

import { useState } from "react";
import Image from "next/image";
import { ChatMessage, EngagementAnalysis, HostQuestion, QuestionAnswerer, CommunityMember, ConversationThread } from "../../utils/youtube";
import { exportEngagementAnalysis, exportEngagementAnalysisCSV } from "../../utils/export";

interface EngagementPanelProps {
  analysis: EngagementAnalysis;
  messages?: ChatMessage[];
}

export default function EngagementPanel({ analysis, messages = [] }: EngagementPanelProps) {
  const [activeTab, setActiveTab] = useState<"qa" | "topics" | "members" | "threads">("qa");
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  const toggleThread = (threadId: string) => {
    const newExpanded = new Set(expandedThreads);
    if (newExpanded.has(threadId)) {
      newExpanded.delete(threadId);
    } else {
      newExpanded.add(threadId);
    }
    setExpandedThreads(newExpanded);
  };

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-gray-100 dark:border-zinc-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 text-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold">Community Engagement Analytics</h2>
          <div className="flex gap-2">
            <button
              onClick={() => exportEngagementAnalysis(messages, analysis)}
              className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded text-sm font-medium transition-colors"
            >
              Export JSON
            </button>
            <button
              onClick={() => exportEngagementAnalysisCSV(messages, analysis)}
              className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded text-sm font-medium transition-colors"
            >
              Export CSV
            </button>
          </div>
        </div>
        <p className="text-orange-100">Host: <span className="font-semibold">{analysis.hostName}</span></p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-6 bg-gray-50 dark:bg-zinc-700/50 border-b border-gray-200 dark:border-zinc-600">
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{analysis.totalQuestions}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Total Questions</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {analysis.answeredQuestions}/{analysis.totalQuestions}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Answered</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {analysis.averageResponseTime}s
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Avg Response</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {analysis.activeCommunityMembers.length}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Active Members</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {analysis.conversationThreads.length}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Conversations</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200 dark:border-zinc-600">
        <button
          onClick={() => setActiveTab("qa")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "qa"
              ? "border-b-2 border-orange-600 text-orange-600 dark:text-orange-400"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          }`}
        >
          Host Q&A ({analysis.hostQuestions.length})
        </button>
        <button
          onClick={() => setActiveTab("topics")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "topics"
              ? "border-b-2 border-orange-600 text-orange-600 dark:text-orange-400"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          }`}
        >
          Topics ({analysis.topicClusters.length})
        </button>
        <button
          onClick={() => setActiveTab("members")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "members"
              ? "border-b-2 border-orange-600 text-orange-600 dark:text-orange-400"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          }`}
        >
          Community ({analysis.activeCommunityMembers.length})
        </button>
        <button
          onClick={() => setActiveTab("threads")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "threads"
              ? "border-b-2 border-orange-600 text-orange-600 dark:text-orange-400"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          }`}
        >
          Threads ({analysis.conversationThreads.length})
        </button>
      </div>

      {/* Content */}
      <div className="p-6 max-h-[600px] overflow-y-auto">
        {/* Q&A Tab */}
        {activeTab === "qa" && <QASection analysis={analysis} />}

        {/* Topics Tab */}
        {activeTab === "topics" && <TopicsSection analysis={analysis} />}

        {/* Members Tab */}
        {activeTab === "members" && <MembersSection analysis={analysis} />}

        {/* Threads Tab */}
        {activeTab === "threads" && (
          <ThreadsSection
            threads={analysis.conversationThreads}
            expandedThreads={expandedThreads}
            onToggleThread={toggleThread}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Q&A Section Component
 */
function QASection({ analysis }: { analysis: EngagementAnalysis }) {
  return (
    <div className="space-y-6">
      {/* Top Question Answerers */}
      <div>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Top Question Answerers
        </h3>
        <div className="space-y-3">
          {analysis.questionAnswerers.slice(0, 10).map((answerer, idx) => (
            <div
              key={answerer.author}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-zinc-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="flex-shrink-0">
                  <div className="relative w-8 h-8 rounded-full overflow-hidden bg-gray-200">
                    {answerer.profileImageUrl && (
                      <Image
                        src={answerer.profileImageUrl}
                        alt={answerer.author}
                        fill
                        className="object-cover"
                        referrerPolicy="no-referrer"
                        unoptimized
                      />
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                    #{idx + 1} {answerer.author}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {answerer.questionsAnswered} answers • Avg {Math.round(answerer.averageResponseTime)}s response
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0">
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <svg
                    viewBox="0 0 36 36"
                    className="w-12 h-12"
                  >
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-gray-200 dark:text-zinc-600"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray={`${(answerer.helpfulnessScore / 100) * 100.53} 100.53`}
                      className="text-green-500 transform -rotate-90 origin-center"
                    />
                  </svg>
                  <div className="absolute text-center">
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                      {answerer.helpfulnessScore}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Host Questions */}
      {analysis.hostQuestions.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
            Recent Questions
          </h3>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {analysis.hostQuestions.slice(-5).map((question) => (
              <div
                key={question.messageId}
                className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/50"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  "{question.question.substring(0, 80)}{question.question.length > 80 ? "..." : ""}"
                </p>
                <div className="flex gap-4 text-xs text-gray-600 dark:text-gray-400">
                  <span>
                    {question.wasAnswered ? `✓ ${question.answers.length} answers` : "No answers yet"}
                  </span>
                  <span>{new Date(question.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Topics Section Component
 */
function TopicsSection({ analysis }: { analysis: EngagementAnalysis }) {
  return (
    <div className="space-y-6">
      {/* Trending Keywords */}
      <div>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Trending Keywords
        </h3>
        <div className="flex flex-wrap gap-2 mb-6">
          {analysis.trendingKeywords.slice(0, 15).map((kw) => (
            <div key={kw.keyword} className="flex items-center gap-2">
              <span className="px-3 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-full text-sm font-medium">
                {kw.keyword}
              </span>
              <span className={`text-xs font-semibold ${
                kw.trend === 'rising' ? 'text-green-600 dark:text-green-400' :
                kw.trend === 'declining' ? 'text-red-600 dark:text-red-400' :
                'text-gray-600 dark:text-gray-400'
              }`}>
                {kw.trend === 'rising' ? '↑' : kw.trend === 'declining' ? '↓' : '→'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Topic Clusters */}
      <div>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Topic Clusters
        </h3>
        <div className="space-y-3">
          {analysis.topicClusters.slice(0, 8).map((cluster) => (
            <div
              key={cluster.topic}
              className="p-3 bg-gray-50 dark:bg-zinc-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="font-medium text-gray-900 dark:text-gray-100">{cluster.topic}</p>
                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-semibold">
                  {cluster.messageCount} messages
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                Top contributors: {cluster.topContributors.join(", ")}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Active: {new Date(cluster.timeRange.start).toLocaleTimeString()} - {new Date(cluster.timeRange.end).toLocaleTimeString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Community Members Section Component
 */
function MembersSection({ analysis }: { analysis: EngagementAnalysis }) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Showing {Math.min(10, analysis.activeCommunityMembers.length)} of {analysis.activeCommunityMembers.length} active members
      </div>

      {analysis.activeCommunityMembers.slice(0, 10).map((member, idx) => (
        <div
          key={member.author}
          className="p-4 bg-gray-50 dark:bg-zinc-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-200">
                  {member.profileImageUrl && (
                    <Image
                      src={member.profileImageUrl}
                      alt={member.author}
                      fill
                      className="object-cover"
                      referrerPolicy="no-referrer"
                      unoptimized
                    />
                  )}
                </div>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  #{idx + 1} {member.author}
                </p>
                {member.badges && member.badges.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {member.badges.map((badge) => (
                      <span key={badge} className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded text-xs font-bold">
                        {badge}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {member.engagementScore}%
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Engagement</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white dark:bg-zinc-800 p-2 rounded">
              <p className="text-gray-500 dark:text-gray-400">Messages</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{member.metrics.totalMessages}</p>
            </div>
            <div className="bg-white dark:bg-zinc-800 p-2 rounded">
              <p className="text-gray-500 dark:text-gray-400">Per Hour</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{member.metrics.messagesPerHour.toFixed(1)}</p>
            </div>
            <div className="bg-white dark:bg-zinc-800 p-2 rounded">
              <p className="text-gray-500 dark:text-gray-400">Answered</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{member.metrics.questionsAnswered}</p>
            </div>
            <div className="bg-white dark:bg-zinc-800 p-2 rounded">
              <p className="text-gray-500 dark:text-gray-400">Conversations</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{member.metrics.conversationCount}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Conversation Threads Section Component
 */
function ThreadsSection({
  threads,
  expandedThreads,
  onToggleThread,
}: {
  threads: ConversationThread[];
  expandedThreads: Set<string>;
  onToggleThread: (threadId: string) => void;
}) {
  if (threads.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No conversation threads detected
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {threads.slice(0, 10).map((thread) => (
        <div
          key={thread.threadId}
          className="border border-gray-200 dark:border-zinc-600 rounded-lg overflow-hidden"
        >
          <button
            onClick={() => onToggleThread(thread.threadId)}
            className="w-full p-4 bg-gray-50 dark:bg-zinc-700/50 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between"
          >
            <div className="flex items-center gap-3 flex-1 text-left">
              <span className="text-2xl">{expandedThreads.has(thread.threadId) ? "▼" : "▶"}</span>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                  {thread.participants.join(", ")}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {thread.messageCount} messages • {thread.participants.length} participants
                </p>
              </div>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(thread.startTime).toLocaleTimeString()}
            </span>
          </button>

          {expandedThreads.has(thread.threadId) && (
            <div className="bg-white dark:bg-zinc-800 p-3 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-zinc-600">
              <p className="mb-2">
                Duration: {new Date(thread.startTime).toLocaleTimeString()} to{" "}
                {new Date(thread.endTime).toLocaleTimeString()}
              </p>
              {thread.topic && <p>Topic: {thread.topic}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
