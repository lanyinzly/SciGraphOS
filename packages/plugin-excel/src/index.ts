import { Plugin } from '@elizaos/core';
import { ExcelService } from './services/excelService.js';
import { excelProvider } from './providers/excelProvider.js';
import { chartGeneratorAction } from './actions/chartGeneratorAction.js';
import { chartResultEvaluator } from './evaluators/chartResultEvaluator.js';
import { chartResultProvider } from './providers/chartResultProvider.js';

/**
 * Excel Plugin for ElizaOS
 * 
 * Provides comprehensive Excel file processing capabilities:
 * - Automatic detection of Excel attachments (.xls, .xlsx)
 * - Content extraction and analysis
 * - Structured data processing
 * - AI-friendly content formatting
 * - Smart chart generation with web links
 * 
 * Features:
 * - Multi-sheet support
 * - CSV-formatted output for AI consumption
 * - File metadata and statistics
 * - Error handling and validation
 * - Intelligent chart generation with URL access
 */
export const excelPlugin: Plugin = {
    name: 'excel',
    description: 'Comprehensive Excel file processing, analysis and chart generation for AI agents',

    /**
     * Plugin initialization function
     */
    init: async (config, runtime) => {
        console.log('🔌 Excel Plugin initialized successfully');
        console.log('📊 Ready to process Excel files (.xls, .xlsx)');
        console.log('🎨 Chart generation capabilities enabled');

        // Debug: Check if actions are registered
        console.log('🔍 Total actions in runtime:', runtime.actions.length);
        console.log('🔍 Action names:', runtime.actions.map(a => a.name).join(', '));

        const hasChartAction = runtime.actions.some(a => a.name === 'GENERATE_CHART');
        console.log('🔍 GENERATE_CHART action found:', hasChartAction);

        if (!hasChartAction) {
            console.log('⚠️ chartGeneratorAction not found, manually registering...');
            try {
                // 手动注册action
                runtime.actions.push(chartGeneratorAction);
                console.log('✅ Manually registered chartGeneratorAction');

                // 再次检查
                const hasChartActionAfter = runtime.actions.some(a => a.name === 'GENERATE_CHART');
                console.log('🔍 GENERATE_CHART action found after manual registration:', hasChartActionAfter);
            } catch (error) {
                console.error('❌ Failed to manually register chartGeneratorAction:', error);
            }
        } else {
            console.log('✅ chartGeneratorAction successfully registered!');
        }
    },

    /**
     * Actions for Excel processing and chart generation
     */
    actions: [chartGeneratorAction],

    /**
     * Services provided by this plugin
     */
    services: [ExcelService],

    /**
     * Providers that automatically process Excel attachments and chart results
     */
    providers: [excelProvider, chartResultProvider],

    /**
     * Evaluators for processing chart generation results
     */
    evaluators: [chartResultEvaluator],
};

export { ExcelService } from './services/excelService.js';
export { excelProvider } from './providers/excelProvider.js';
export { chartGeneratorAction } from './actions/chartGeneratorAction.js';
export { chartResultEvaluator } from './evaluators/chartResultEvaluator.js';
export { chartResultProvider } from './providers/chartResultProvider.js';
export default excelPlugin; 