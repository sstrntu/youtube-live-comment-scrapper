import { ChatMessage, InsightData, EngagementAnalysis } from './youtube';

export const exportToJSON = (data: ChatMessage[], filename: string = 'youtube-chat-export') => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const exportToCSV = (data: ChatMessage[], filename: string = 'youtube-chat-export') => {
    if (data.length === 0) return;

    const headers = ['Timestamp', 'Author', 'Message', 'Type', 'Amount', 'Source', 'Message ID'];
    const csvContent = [
        headers.join(','),
        ...data.map(row => {
            const escapedMessage = row.message.replace(/"/g, '""');
            const escapedAuthor = row.author.replace(/"/g, '""');

            return [
                `"${row.timestamp}"`,
                `"${escapedAuthor}"`,
                `"${escapedMessage}"`,
                `"${row.type || 'text'}"`,
                `"${row.amount || ''}"`,
                `"${row.source || 'unknown'}"`,
                `"${row.id}"`
            ].join(',');
        })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const exportToJSONWithInsights = (
    data: ChatMessage[],
    insights: InsightData,
    filename: string = 'youtube-chat-export-with-insights'
) => {
    const payload = {
        metadata: {
            exportDate: new Date().toISOString(),
            totalMessages: data.length,
            scrapingMethod: 'hybrid',
        },
        insights,
        messages: data,
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const exportToCSVWithInsights = (
    data: ChatMessage[],
    insights: InsightData,
    filename: string = 'youtube-chat-export-with-insights'
) => {
    if (data.length === 0) return;

    // Header section with insights
    const insightsLines = [
        '# YouTube Live Chat Export',
        `# Export Date: ${new Date().toISOString()}`,
        `# Total Messages: ${insights.totalMessages}`,
        `# Unique Users: ${insights.uniqueUsers}`,
        `# Duration: ${insights.timeRange.durationMinutes} minutes`,
        `# Average Message Length: ${insights.averageMessageLength} characters`,
        `# Super Chat Revenue: ${insights.superChatRevenue.currency} ${insights.superChatRevenue.total}`,
        `# Super Chat Count: ${insights.superChatRevenue.count}`,
        `# Peak Activity: ${insights.peakActivity.messagesPerMinute} messages/min at ${insights.peakActivity.timestamp}`,
        '',
    ];

    // Message type breakdown
    const { text, paid, membership, sticker } = insights.messageTypeBreakdown;
    insightsLines.push(
        `# Message Types - Text: ${text}, Super Chat: ${paid}, Membership: ${membership}, Sticker: ${sticker}`,
        ''
    );

    // Messages section
    const headers = ['Timestamp', 'Author', 'Message', 'Type', 'Amount', 'Source', 'Message ID'];
    const messageLines = data.map(row => {
        const escapedMessage = row.message.replace(/"/g, '""');
        const escapedAuthor = row.author.replace(/"/g, '""');

        return [
            `"${row.timestamp}"`,
            `"${escapedAuthor}"`,
            `"${escapedMessage}"`,
            `"${row.type || 'text'}"`,
            `"${row.amount || ''}"`,
            `"${row.source || 'unknown'}"`,
            `"${row.id}"`
        ].join(',');
    });

    const csvContent = [
        ...insightsLines,
        headers.join(','),
        ...messageLines,
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const exportEngagementAnalysis = (
    data: ChatMessage[],
    analysis: EngagementAnalysis,
    filename: string = 'engagement-analysis'
) => {
    if (!analysis) return;

    const payload = {
        metadata: {
            exportDate: new Date().toISOString(),
            totalMessages: data.length,
            hostName: analysis.hostName,
        },
        analysis,
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const exportEngagementAnalysisCSV = (
    data: ChatMessage[],
    analysis: EngagementAnalysis,
    filename: string = 'engagement-analysis'
) => {
    if (!analysis) return;

    const lines: string[] = [];

    // Header
    lines.push('# YouTube Live Chat Engagement Analysis');
    lines.push(`# Export Date: ${new Date().toISOString()}`);
    lines.push(`# Host: ${analysis.hostName}`);
    lines.push(`# Total Messages: ${data.length}`);
    lines.push('');

    // Summary stats
    lines.push('## Engagement Summary');
    lines.push(`Total Questions,${analysis.totalQuestions}`);
    lines.push(`Answered Questions,${analysis.answeredQuestions}`);
    lines.push(`Answer Rate,${analysis.totalQuestions > 0 ? ((analysis.answeredQuestions / analysis.totalQuestions) * 100).toFixed(1) + '%' : 'N/A'}`);
    lines.push(`Average Response Time,${analysis.averageResponseTime}s`);
    lines.push(`Top Topics,"${analysis.topTopics.join(', ')}"`);
    lines.push('');

    // Question Answerers
    if (analysis.questionAnswerers.length > 0) {
        lines.push('## Top Question Answerers');
        lines.push('Rank,Author,Questions Answered,Avg Response Time (seconds),Helpfulness Score');
        analysis.questionAnswerers.slice(0, 10).forEach((qa, idx) => {
            lines.push(`${idx + 1},"${qa.author}",${qa.questionsAnswered},${Math.round(qa.averageResponseTime)},${qa.helpfulnessScore}`);
        });
        lines.push('');
    }

    // Active Community Members
    if (analysis.activeCommunityMembers.length > 0) {
        lines.push('## Active Community Members');
        lines.push('Rank,Author,Engagement Score,Total Messages,Messages Per Hour,Questions Answered,Conversations');
        analysis.activeCommunityMembers.slice(0, 20).forEach((member, idx) => {
            lines.push(
                `${idx + 1},"${member.author}",${member.engagementScore},${member.metrics.totalMessages},${member.metrics.messagesPerHour.toFixed(1)},${member.metrics.questionsAnswered},${member.metrics.conversationCount}`
            );
        });
        lines.push('');
    }

    // Topics
    if (analysis.topicClusters.length > 0) {
        lines.push('## Topic Clusters');
        lines.push('Topic,Message Count,Top Contributors,Time Range');
        analysis.topicClusters.forEach((topic) => {
            const timeRange = `${new Date(topic.timeRange.start).toLocaleTimeString()} - ${new Date(topic.timeRange.end).toLocaleTimeString()}`;
            lines.push(`"${topic.topic}",${topic.messageCount},"${topic.topContributors.join(', ')}","${timeRange}"`);
        });
        lines.push('');
    }

    // Keywords
    if (analysis.trendingKeywords.length > 0) {
        lines.push('## Trending Keywords');
        lines.push('Keyword,Frequency,Trend');
        analysis.trendingKeywords.forEach((kw) => {
            lines.push(`"${kw.keyword}",${kw.frequency},${kw.trend}`);
        });
    }

    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
