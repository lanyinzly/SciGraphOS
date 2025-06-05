import {
    Evaluator,
    IAgentRuntime,
    Memory,
    State,
} from '@elizaos/core';

export const chartResultEvaluator: Evaluator = {
    name: 'CHART_RESULT',
    similes: ['CHART_RESPONSE', 'CHART_OUTPUT'],
    description: '处理图表生成结果并返回给用户',
    validate: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<boolean> => {
        // 检查state中是否有图表生成结果
        return Boolean(state?.chartResult);
    },
    handler: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<any> => {
        if (state?.chartResult) {
            const result = state.chartResult;

            // 清除state中的结果，避免重复处理
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