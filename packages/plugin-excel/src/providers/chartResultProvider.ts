import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
    ProviderResult,
} from '@elizaos/core';

export const chartResultProvider: Provider = {
    name: 'chartResult',
    description: 'Provides chart generation results',
    get: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ProviderResult> => {
        // Check if there are chart generation results in state
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