import { InsightData } from '@/utils/youtube';
import Image from 'next/image';

interface InsightsPanelProps {
  insights: InsightData;
}

const SimpleLineChart = ({ data }: { data: { timestamp: string; count: number }[] }) => {
  if (data.length === 0) return null;

  const maxCount = Math.max(...data.map(d => d.count));
  const width = Math.min(data.length * 30, 400);
  const height = 150;
  const padding = 20;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * (width - padding * 2);
    const y = height - padding - (d.count / maxCount) * (height - padding * 2);
    return { x, y, count: d.count };
  });

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="w-full">
      <polyline points={pathData} fill="none" stroke="#dc2626" strokeWidth="2" />
      <polyline
        points={`${pathData} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`}
        fill="#dc2626"
        opacity="0.1"
      />
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e5e7eb" strokeWidth="1" />
    </svg>
  );
};

const MessageTypeChart = ({ breakdown }: { breakdown: { text: number; paid: number; membership: number; sticker: number } }) => {
  const total = breakdown.text + breakdown.paid + breakdown.membership + breakdown.sticker;
  if (total === 0) return null;

  const data = [
    { label: 'Text', count: breakdown.text, color: '#3b82f6' },
    { label: 'Super Chat', count: breakdown.paid, color: '#f59e0b' },
    { label: 'Membership', count: breakdown.membership, color: '#10b981' },
    { label: 'Sticker', count: breakdown.sticker, color: '#8b5cf6' },
  ].filter(d => d.count > 0);

  return (
    <div className="flex gap-4 items-center justify-center">
      <svg width="120" height="120" viewBox="0 0 120 120" className="flex-shrink-0">
        {data.map((item, index) => {
          const percentage = (item.count / total) * 100;
          const circumference = 2 * Math.PI * 45;
          const offset = circumference - (percentage / 100) * circumference;
          const rotate = data.slice(0, index).reduce((sum, d) => sum + (d.count / total) * 100, 0);

          return (
            <circle
              key={item.label}
              cx="60"
              cy="60"
              r="45"
              fill="none"
              stroke={item.color}
              strokeWidth="12"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{
                transform: `rotate(${(rotate / 100) * 360}deg)`,
                transformOrigin: '60px 60px',
              }}
            />
          );
        })}
      </svg>
      <div className="flex flex-col gap-2">
        {data.map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-gray-600 dark:text-gray-300">
              {item.label}: {item.count} ({Math.round((item.count / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function InsightsPanel({ insights }: InsightsPanelProps) {
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg p-6 border border-gray-100 dark:border-zinc-700 space-y-6">
      <h2 className="text-xl font-semibold">Chat Analytics</h2>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <div className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">Unique Users</div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{insights.uniqueUsers}</div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
          <div className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">Avg Message Length</div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{insights.averageMessageLength}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">characters</div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
          <div className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">Duration</div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{insights.timeRange.durationMinutes}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">minutes</div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
          <div className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">Super Chat Revenue</div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {insights.superChatRevenue.currency === 'USD' ? '$' : ''}{insights.superChatRevenue.total}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{insights.superChatRevenue.count} chats</div>
        </div>
      </div>

      {/* Message Rate */}
      <div className="border-t border-gray-200 dark:border-zinc-700 pt-6">
        <h3 className="font-semibold mb-4">Message Rate (per minute)</h3>
        <SimpleLineChart data={insights.messageRate} />
      </div>

      {/* Message Type Breakdown */}
      <div className="border-t border-gray-200 dark:border-zinc-700 pt-6">
        <h3 className="font-semibold mb-4">Message Type Breakdown</h3>
        <MessageTypeChart breakdown={insights.messageTypeBreakdown} />
      </div>

      {/* Peak Activity */}
      {insights.peakActivity.timestamp && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border-t border-gray-200 dark:border-zinc-700">
          <h3 className="font-semibold mb-2">Peak Activity</h3>
          <div className="text-sm text-gray-700 dark:text-gray-300">
            <div>{insights.peakActivity.messagesPerMinute} messages/min</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {new Date(insights.peakActivity.timestamp).toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}

      {/* Top Contributors */}
      {insights.topContributors.length > 0 && (
        <div className="border-t border-gray-200 dark:border-zinc-700 pt-6">
          <h3 className="font-semibold mb-4">Top Contributors</h3>
          <div className="space-y-3">
            {insights.topContributors.map((contributor, index) => (
              <div key={contributor.author} className="flex items-center gap-3 pb-3 border-b border-gray-100 dark:border-zinc-700 last:border-0 last:pb-0">
                <div className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5 text-center">#{index + 1}</div>
                {contributor.profileImageUrl ? (
                  <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                    <Image
                      src={contributor.profileImageUrl}
                      alt={contributor.author}
                      fill
                      className="object-cover"
                      referrerPolicy="no-referrer"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-zinc-600 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300 flex-shrink-0">
                    {contributor.author.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">{contributor.author}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{contributor.count} messages</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
