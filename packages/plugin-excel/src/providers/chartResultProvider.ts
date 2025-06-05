import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
    ProviderResult,
} from '@elizaos/core';

export const chartResultProvider: Provider = {
    name: 'chartResult',
    description: '提供图表生成的结果',
    get: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ProviderResult> => {
        // 检查state中是否有图表生成结果
        if (state?.chartGenerated && state?.chartResponse) {
            console.log('📊 Chart result provider: returning chart response');

            return {
                text: state.chartResponse,
                values: {
                    chartGenerated: true,
                    chartSuccess: state.chartSuccess || false
                },
                data: {
                    chartResponse: state.chartResponse
                }
            };
        }

        return {
            text: '',
            values: {},
            data: {}
        };
    }
};

export default chartResultProvider; 