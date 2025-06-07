import {
    Evaluator,
    IAgentRuntime,
    Memory,
    State,
} from '@elizaos/core';

export const chartResultEvaluator: Evaluator = {
    name: 'CHART_RESULT',
    similes: ['CHART_RESPONSE', 'CHART_OUTPUT'],
    description: 'Process chart generation results and return to user',
    validate: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<boolean> => {
        // Check if state contains chart generation results
        return Boolean(state?.chartResult);
    },
    handler: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<any> => {
        if (state?.chartResult) {
            const result = state.chartResult;

            // Clear results from state to avoid duplicate processing
            delete state.chartResult;

            return {
                text: result.text,
                success: result.success,
                data: result.data || null,
                error: result.error || null
            };
        }

        return null;
    },
    examples: []
};

export default chartResultEvaluator; 