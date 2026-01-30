import { ChatMessage, InsightData } from './youtube';

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
