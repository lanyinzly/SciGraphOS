import { Plugin } from '@elizaos/core';
import { ExcelService } from './services/excelService.js';
import { excelProvider } from './providers/excelProvider.js';

/**
 * Excel Plugin for ElizaOS
 * 
 * Provides comprehensive Excel file processing capabilities:
 * - Automatic detection of Excel attachments (.xls, .xlsx)
 * - Content extraction and analysis
 * - Structured data processing
 * - AI-friendly content formatting
 * 
 * Features:
 * - Multi-sheet support
 * - CSV-formatted output for AI consumption
 * - File metadata and statistics
 * - Error handling and validation
 */
export const excelPlugin: Plugin = {
    name: 'excel',
    description: 'Comprehensive Excel file processing and analysis for AI agents',

    /**
     * Plugin initialization function
     */
    init: async (config, runtime) => {
        console.log('🔌 Excel Plugin initialized successfully');
        console.log('📊 Ready to process Excel files (.xls, .xlsx)');
    },

    /**
     * Services provided by this plugin
     */
    services: [ExcelService],

    /**
     * Providers that automatically process Excel attachments
     */
    providers: [excelProvider],

    /**
     * No actions - Excel processing is automatic via providers
     */
    actions: [],

    /**
     * No evaluators needed for basic Excel processing
     */
    evaluators: [],
};

export { ExcelService } from './services/excelService.js';
export { excelProvider } from './providers/excelProvider.js';
export default excelPlugin; 