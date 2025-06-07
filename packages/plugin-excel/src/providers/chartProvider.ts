import { IAgentRuntime, Memory, Provider, State, ProviderResult } from '@elizaos/core';

export const chartProvider: Provider = {
    name: 'chartProvider',
    description: 'Provides information about recently generated charts',

    get: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ProviderResult> => {
        // Check if there's recent chart generation info in state
        if (state?.chartGenerated) {
            const chartInfo = state.chartGenerated;
            return {
                text: `
RECENT CHART GENERATION:
- Chart successfully generated with session ID: ${chartInfo.sessionId}
- View Chart: ${chartInfo.viewUrl}
- Download Image: ${chartInfo.downloadUrl}
- Chart Gallery: ${chartInfo.galleryUrl}
- Generated at: ${chartInfo.timestamp}

IMPORTANT: When responding to chart generation requests, include these actual links in your response to the user.
`,
                data: { chartInfo }
            };
        }

        // Check if there's an error in chart generation
        if (state?.chartError) {
            const errorInfo = state.chartError;
            return {
                text: `
CHART GENERATION ERROR:
- Error occurred: ${errorInfo.error}
- Time: ${errorInfo.timestamp}

IMPORTANT: Inform the user that chart generation failed and suggest they try again.
`,
                data: { error: errorInfo }
            };
        }

        // Check recent memories for chart generation
        const recentMemories = await runtime.getMemories({
            roomId: message.roomId,
            count: 10,
            unique: false,
            tableName: 'messages'
        });

        const chartMemory = recentMemories.find(mem =>
            mem.content.source === 'chart_generator' &&
            mem.content.text?.includes('CHART_GENERATED:')
        );

        if (chartMemory && chartMemory.content.text) {
            try {
                const chartData = chartMemory.content.text.replace('CHART_GENERATED: ', '');
                const chartInfo = JSON.parse(chartData);
                return {
                    text: `
RECENT CHART GENERATION FROM MEMORY:
- Chart successfully generated with session ID: ${chartInfo.sessionId}
- View Chart: ${chartInfo.viewUrl}
- Download Image: ${chartInfo.downloadUrl}
- Chart Gallery: ${chartInfo.galleryUrl}
- Generated at: ${chartInfo.timestamp}

IMPORTANT: Include these actual links in your response to the user.
`,
                    data: { chartInfo }
                };
            } catch (error) {
                console.error('Error parsing chart memory:', error);
            }
        }

        return { text: '' };
    }
}; 