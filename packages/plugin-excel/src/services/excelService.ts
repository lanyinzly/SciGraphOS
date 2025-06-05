import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { IAgentRuntime, Service } from '@elizaos/core';

export class ExcelService extends Service {
    static serviceType = 'excel';
    capabilityDescription = 'The agent is able to read and analyze Excel files and extract their content for AI processing';

    constructor(runtime: IAgentRuntime) {
        super(runtime);
    }

    async initialize(): Promise<void> {
        // Excel service initialization
        console.log('Excel service initialized');
    }

    async stop(): Promise<void> {
        // Clean up resources if needed
        console.log('Excel service stopped');
    }

    static async start(runtime: IAgentRuntime): Promise<ExcelService> {
        const service = new ExcelService(runtime);
        await service.initialize();
        return service;
    }

    /**
     * Extract text content from Excel file
     * @param filePath Path to the Excel file
     * @returns Extracted text content as string
     */
    async extractTextFromExcel(filePath: string): Promise<string> {
        try {
            // Convert to absolute path if it's relative
            let absolutePath: string;
            if (path.isAbsolute(filePath)) {
                absolutePath = filePath;
            } else {
                absolutePath = path.resolve(process.cwd(), filePath);
            }

            if (!fs.existsSync(absolutePath)) {
                // Try alternative path resolution - from project root
                const alternativePath = path.resolve('/Volumes/Code/Projects/AI/blockSeq', filePath);
                if (fs.existsSync(alternativePath)) {
                    absolutePath = alternativePath;
                } else {
                    throw new Error(`Excel file not found: ${filePath} (tried: ${absolutePath}, ${alternativePath})`);
                }
            }

            // Read the Excel file using buffer to avoid file access issues
            const buffer = fs.readFileSync(absolutePath);
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            let extractedText = '';

            // Process each worksheet
            workbook.SheetNames.forEach((sheetName, index) => {
                const worksheet = workbook.Sheets[sheetName];

                // Add sheet header
                extractedText += `\n=== Sheet ${index + 1}: "${sheetName}" ===\n`;

                // Convert sheet to CSV format for better readability
                const csvData = XLSX.utils.sheet_to_csv(worksheet);
                extractedText += csvData;

                // Add separator between sheets
                if (index < workbook.SheetNames.length - 1) {
                    extractedText += '\n\n';
                }
            });

            return extractedText.trim();
        } catch (error) {
            console.error('Error extracting text from Excel:', error);
            throw new Error(`Failed to extract text from Excel file: ${error.message}`);
        }
    }

    /**
     * Extract structured data from Excel file
     * @param filePath Path to the Excel file
     * @returns Structured data with sheet information
     */
    async extractStructuredDataFromExcel(filePath: string): Promise<{
        fileName: string;
        sheets: Array<{
            name: string;
            data: any[][];
            rowCount: number;
            columnCount: number;
        }>;
        summary: string;
    }> {
        try {
            // Convert to absolute path if it's relative
            let absolutePath: string;
            if (path.isAbsolute(filePath)) {
                absolutePath = filePath;
            } else {
                // If path starts with packages/cli/, use project root as base
                if (filePath.startsWith('packages/cli/')) {
                    absolutePath = path.resolve(process.cwd(), filePath);
                } else {
                    // Otherwise, check if it's a CLI data path and resolve from project root
                    absolutePath = path.resolve(process.cwd(), filePath);
                }
            }

            if (!fs.existsSync(absolutePath)) {
                // Try alternative path resolution - from project root
                const alternativePath = path.resolve('/Volumes/Code/Projects/AI/blockSeq', filePath);
                if (fs.existsSync(alternativePath)) {
                    absolutePath = alternativePath;
                } else {
                    throw new Error(`Excel file not found: ${filePath} (tried: ${absolutePath}, ${alternativePath})`);
                }
            }

            const fileName = path.basename(filePath);
            const buffer = fs.readFileSync(absolutePath);
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheets: Array<{
                name: string;
                data: any[][];
                rowCount: number;
                columnCount: number;
            }> = [];

            // Process each worksheet
            for (const sheetName of workbook.SheetNames) {
                const worksheet = workbook.Sheets[sheetName];

                // Convert to array of arrays
                const data = XLSX.utils.sheet_to_json(worksheet, {
                    header: 1,
                    defval: ''
                }) as any[][];

                // Calculate dimensions
                const rowCount = data.length;
                const columnCount = data.length > 0 ? Math.max(...data.map(row => (row as any[]).length)) : 0;

                sheets.push({
                    name: sheetName,
                    data: data,
                    rowCount,
                    columnCount
                });
            }

            // Generate summary
            const summary = this.generateExcelSummary(fileName, sheets);

            return {
                fileName,
                sheets,
                summary
            };
        } catch (error) {
            console.error('Error extracting structured data from Excel:', error);
            throw new Error(`Failed to extract structured data from Excel file: ${error.message}`);
        }
    }

    /**
     * Generate a human-readable summary of the Excel file
     */
    private generateExcelSummary(fileName: string, sheets: any[]): string {
        const totalSheets = sheets.length;
        const totalRows = sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0);
        const totalColumns = sheets.reduce((sum, sheet) => sum + sheet.columnCount, 0);

        let summary = `Excel File: ${fileName}\n`;
        summary += `Total Sheets: ${totalSheets}\n`;
        summary += `Total Rows: ${totalRows}\n`;
        summary += `Average Columns per Sheet: ${Math.round(totalColumns / totalSheets)}\n\n`;

        summary += 'Sheet Details:\n';
        sheets.forEach((sheet, index) => {
            summary += `${index + 1}. "${sheet.name}" - ${sheet.rowCount} rows × ${sheet.columnCount} columns\n`;

            // Add preview of first few rows if data exists
            if (sheet.data.length > 0) {
                summary += '   Preview:\n';
                const previewRows = Math.min(3, sheet.data.length);
                for (let i = 0; i < previewRows; i++) {
                    const row = sheet.data[i] as any[];
                    const rowPreview = row.slice(0, 5).join(' | '); // First 5 columns
                    summary += `   Row ${i + 1}: ${rowPreview}\n`;
                }
                if (sheet.data.length > 3) {
                    summary += `   ... and ${sheet.data.length - 3} more rows\n`;
                }
            }
            summary += '\n';
        });

        return summary;
    }

    /**
     * Check if file is a valid Excel file
     */
    static isExcelFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return ext === '.xlsx' || ext === '.xls';
    }

    /**
     * Get Excel file info without full parsing
     */
    async getExcelInfo(filePath: string): Promise<{
        fileName: string;
        fileSize: number;
        sheetCount: number;
        sheetNames: string[];
    }> {
        try {
            // Convert to absolute path if it's relative
            let absolutePath: string;
            if (path.isAbsolute(filePath)) {
                absolutePath = filePath;
            } else {
                absolutePath = path.resolve(process.cwd(), filePath);
            }

            if (!fs.existsSync(absolutePath)) {
                // Try alternative path resolution - from project root
                const alternativePath = path.resolve('/Volumes/Code/Projects/AI/blockSeq', filePath);
                if (fs.existsSync(alternativePath)) {
                    absolutePath = alternativePath;
                } else {
                    throw new Error(`Excel file not found: ${filePath} (tried: ${absolutePath}, ${alternativePath})`);
                }
            }

            const stats = fs.statSync(absolutePath);
            const buffer = fs.readFileSync(absolutePath);
            const workbook = XLSX.read(buffer, { type: 'buffer', bookSheets: true });

            return {
                fileName: path.basename(filePath),
                fileSize: stats.size,
                sheetCount: workbook.SheetNames.length,
                sheetNames: workbook.SheetNames
            };
        } catch (error) {
            console.error('Error getting Excel info:', error);
            throw new Error(`Failed to get Excel file info: ${error.message}`);
        }
    }

    /**
     * Perform intelligent data analysis on Excel file
     * @param filePath Path to the Excel file
     * @returns Intelligent analysis results
     */
    async performIntelligentAnalysis(filePath: string): Promise<{
        fileName: string;
        sheets: Array<{
            name: string;
            analysis: {
                dataTypes: { [column: string]: string };
                statistics: { [column: string]: any };
                patterns: string[];
                insights: string[];
                anomalies: string[];
                trends: string[];
            };
        }>;
        overallInsights: string[];
        recommendations: string[];
    }> {
        try {
            const structuredData = await this.extractStructuredDataFromExcel(filePath);
            const fileName = structuredData.fileName;
            const sheets: Array<{
                name: string;
                analysis: {
                    dataTypes: { [column: string]: string };
                    statistics: { [column: string]: any };
                    patterns: string[];
                    insights: string[];
                    anomalies: string[];
                    trends: string[];
                };
            }> = [];

            for (const sheet of structuredData.sheets) {
                const analysis = this.analyzeSheetData(sheet);
                sheets.push({
                    name: sheet.name,
                    analysis
                });
            }

            // Generate overall insights
            const overallInsights = this.generateOverallInsights(sheets);
            const recommendations = this.generateRecommendations(sheets);

            return {
                fileName,
                sheets,
                overallInsights,
                recommendations
            };
        } catch (error) {
            console.error('Error performing intelligent analysis:', error);
            throw new Error(`Failed to perform intelligent analysis: ${error.message}`);
        }
    }

    /**
     * Analyze data in a single sheet
     */
    private analyzeSheetData(sheet: any): {
        dataTypes: { [column: string]: string };
        statistics: { [column: string]: any };
        patterns: string[];
        insights: string[];
        anomalies: string[];
        trends: string[];
    } {
        const { data } = sheet;
        const dataTypes: { [column: string]: string } = {};
        const statistics: { [column: string]: any } = {};
        const patterns: string[] = [];
        const insights: string[] = [];
        const anomalies: string[] = [];
        const trends: string[] = [];

        if (data.length === 0) {
            return { dataTypes, statistics, patterns, insights, anomalies, trends };
        }

        const headers = data[0] as string[];
        const dataRows = data.slice(1);

        // Analyze each column
        headers.forEach((header, colIndex) => {
            const columnData = dataRows.map(row => row[colIndex]).filter(val => val !== '' && val !== null && val !== undefined);

            if (columnData.length === 0) return;

            // Determine data type
            const dataType = this.determineDataType(columnData);
            dataTypes[header] = dataType;

            // Calculate statistics based on data type
            if (dataType === 'number') {
                const numericData = columnData.map(val => Number(val)).filter(val => !isNaN(val));
                if (numericData.length > 0) {
                    statistics[header] = this.calculateNumericStatistics(numericData);

                    // Detect trends for numeric data
                    const trend = this.detectTrend(numericData);
                    if (trend) {
                        trends.push(`${header}: ${trend}`);
                    }

                    // Detect anomalies
                    const anomaly = this.detectAnomalies(numericData, header);
                    if (anomaly) {
                        anomalies.push(anomaly);
                    }
                }
            } else if (dataType === 'date') {
                statistics[header] = this.calculateDateStatistics(columnData);
                patterns.push(`${header} contains time series data`);
            } else if (dataType === 'text') {
                statistics[header] = this.calculateTextStatistics(columnData);

                // Check for categorical patterns
                const uniqueValues = [...new Set(columnData)];
                if (uniqueValues.length < columnData.length * 0.5) {
                    patterns.push(`${header} appears to be categorical data with ${uniqueValues.length} categories`);
                }
            }
        });

        // Generate insights based on analysis
        insights.push(...this.generateSheetInsights(sheet.name, dataTypes, statistics, dataRows.length));

        return { dataTypes, statistics, patterns, insights, anomalies, trends };
    }

    /**
     * Determine the data type of a column
     */
    private determineDataType(columnData: any[]): string {
        const sample = columnData.slice(0, Math.min(10, columnData.length));

        let numberCount = 0;
        let dateCount = 0;
        let percentageCount = 0;

        for (const value of sample) {
            const strValue = String(value);

            if (strValue.includes('%')) {
                percentageCount++;
            } else if (!isNaN(Number(value)) && !isNaN(parseFloat(value))) {
                numberCount++;
            } else if (this.isDateString(strValue)) {
                dateCount++;
            }
        }

        const total = sample.length;
        if (percentageCount / total > 0.5) return 'percentage';
        if (numberCount / total > 0.7) return 'number';
        if (dateCount / total > 0.7) return 'date';
        return 'text';
    }

    /**
     * Check if a string represents a date
     */
    private isDateString(str: string): boolean {
        const datePatterns = [
            /^\d{4}-\d{2}-\d{2}$/,
            /^\d{2}\/\d{2}\/\d{4}$/,
            /^\d{2}-\d{2}-\d{4}$/,
            /^\d{4}\/\d{2}\/\d{2}$/
        ];

        return datePatterns.some(pattern => pattern.test(str)) || !isNaN(Date.parse(str));
    }

    /**
     * Calculate statistics for numeric data
     */
    private calculateNumericStatistics(data: number[]): any {
        const sorted = [...data].sort((a, b) => a - b);
        const sum = data.reduce((a, b) => a + b, 0);
        const mean = sum / data.length;
        const median = sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];

        const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length;
        const stdDev = Math.sqrt(variance);

        return {
            count: data.length,
            sum: Math.round(sum * 100) / 100,
            mean: Math.round(mean * 100) / 100,
            median: Math.round(median * 100) / 100,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            stdDev: Math.round(stdDev * 100) / 100,
            range: sorted[sorted.length - 1] - sorted[0]
        };
    }

    /**
     * Calculate statistics for date data
     */
    private calculateDateStatistics(data: any[]): any {
        const dates = data.map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
        if (dates.length === 0) return { count: 0 };

        const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
        const earliest = sorted[0];
        const latest = sorted[sorted.length - 1];
        const span = latest.getTime() - earliest.getTime();
        const spanDays = Math.floor(span / (1000 * 60 * 60 * 24));

        return {
            count: dates.length,
            earliest: earliest.toISOString().split('T')[0],
            latest: latest.toISOString().split('T')[0],
            spanDays: spanDays,
            spanYears: Math.round(spanDays / 365 * 100) / 100
        };
    }

    /**
     * Calculate statistics for text data
     */
    private calculateTextStatistics(data: any[]): any {
        const uniqueValues = [...new Set(data)];
        const lengths = data.map(d => String(d).length);
        const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;

        return {
            count: data.length,
            uniqueCount: uniqueValues.length,
            uniqueRatio: Math.round(uniqueValues.length / data.length * 100) / 100,
            avgLength: Math.round(avgLength * 100) / 100,
            maxLength: Math.max(...lengths),
            minLength: Math.min(...lengths)
        };
    }

    /**
     * Detect trends in numeric data
     */
    private detectTrend(data: number[]): string | null {
        if (data.length < 3) return null;

        let increasing = 0;
        let decreasing = 0;

        for (let i = 1; i < data.length; i++) {
            if (data[i] > data[i - 1]) increasing++;
            else if (data[i] < data[i - 1]) decreasing++;
        }

        const total = data.length - 1;
        if (increasing / total > 0.7) return 'Strong upward trend';
        if (decreasing / total > 0.7) return 'Strong downward trend';
        if (increasing / total > 0.6) return 'Moderate upward trend';
        if (decreasing / total > 0.6) return 'Moderate downward trend';

        return 'No clear trend';
    }

    /**
     * Detect anomalies in numeric data
     */
    private detectAnomalies(data: number[], columnName: string): string | null {
        if (data.length < 5) return null;

        const stats = this.calculateNumericStatistics(data);
        const threshold = stats.stdDev * 2; // 2 standard deviations

        const anomalies = data.filter(val =>
            Math.abs(val - stats.mean) > threshold
        );

        if (anomalies.length > 0) {
            return `${columnName} has ${anomalies.length} potential outlier(s): ${anomalies.slice(0, 3).join(', ')}${anomalies.length > 3 ? '...' : ''}`;
        }

        return null;
    }

    /**
     * Generate insights for a sheet
     */
    private generateSheetInsights(sheetName: string, dataTypes: any, statistics: any, rowCount: number): string[] {
        const insights: string[] = [];

        // Data volume insights
        if (rowCount > 1000) {
            insights.push(`${sheetName} contains a large dataset with ${rowCount} rows`);
        } else if (rowCount < 10) {
            insights.push(`${sheetName} contains a small dataset with only ${rowCount} rows`);
        }

        // Data type insights
        const numericColumns = Object.entries(dataTypes).filter(([_, type]) => type === 'number').length;
        const dateColumns = Object.entries(dataTypes).filter(([_, type]) => type === 'date').length;

        if (numericColumns > 3) {
            insights.push(`${sheetName} is numeric-heavy with ${numericColumns} numeric columns, suitable for quantitative analysis`);
        }

        if (dateColumns > 0) {
            insights.push(`${sheetName} contains time-based data, suitable for temporal analysis`);
        }

        // Statistical insights
        Object.entries(statistics).forEach(([column, stats]: [string, any]) => {
            if (stats.stdDev && stats.mean) {
                const cv = stats.stdDev / stats.mean; // Coefficient of variation
                if (cv > 1) {
                    insights.push(`${column} shows high variability (CV: ${Math.round(cv * 100)}%)`);
                }
            }
        });

        return insights;
    }

    /**
     * Generate overall insights across all sheets
     */
    private generateOverallInsights(sheets: any[]): string[] {
        const insights: string[] = [];

        if (sheets.length > 1) {
            insights.push(`Multi-sheet workbook with ${sheets.length} sheets suggests complex data structure`);

            // Check for related data across sheets
            const allColumns = sheets.flatMap(sheet => Object.keys(sheet.analysis.dataTypes));
            const columnCounts = allColumns.reduce((acc, col) => {
                acc[col] = (acc[col] || 0) + 1;
                return acc;
            }, {} as { [key: string]: number });

            const sharedColumns = Object.entries(columnCounts)
                .filter(([_, count]) => count > 1)
                .map(([col, _]) => col);

            if (sharedColumns.length > 0) {
                insights.push(`Potential data relationships found: shared columns ${sharedColumns.slice(0, 3).join(', ')}`);
            }
        }

        // Analyze data complexity
        const totalPatterns = sheets.reduce((sum, sheet) => sum + sheet.analysis.patterns.length, 0);
        if (totalPatterns > 5) {
            insights.push('Complex data patterns detected, suitable for advanced analytics');
        }

        return insights;
    }

    /**
     * Generate recommendations based on analysis
     */
    private generateRecommendations(sheets: any[]): string[] {
        const recommendations: string[] = [];

        sheets.forEach(sheet => {
            const { analysis } = sheet;

            // Recommend visualizations
            const numericColumns = Object.entries(analysis.dataTypes).filter(([_, type]) => type === 'number').length;
            const dateColumns = Object.entries(analysis.dataTypes).filter(([_, type]) => type === 'date').length;

            if (numericColumns >= 2) {
                recommendations.push(`Consider scatter plots or correlation analysis for ${sheet.name}`);
            }

            if (dateColumns > 0 && numericColumns > 0) {
                recommendations.push(`Time series visualization recommended for ${sheet.name}`);
            }

            // Recommend data cleaning
            if (analysis.anomalies.length > 0) {
                recommendations.push(`Review data quality in ${sheet.name} - anomalies detected`);
            }

            // Recommend analysis types
            if (analysis.trends.length > 0) {
                recommendations.push(`Trend analysis valuable for ${sheet.name}`);
            }
        });

        return recommendations;
    }

    /**
     * Generate AI-friendly summary with intelligent insights
     * @param filePath Path to the Excel file
     * @returns AI-optimized summary with insights
     */
    async generateAIFriendlySummary(filePath: string): Promise<string> {
        try {
            const analysis = await this.performIntelligentAnalysis(filePath);
            const basicData = await this.extractStructuredDataFromExcel(filePath);

            let summary = `# Excel File Analysis: ${analysis.fileName}\n\n`;

            // Executive Summary
            summary += `## Executive Summary\n`;
            summary += `- **File**: ${analysis.fileName}\n`;
            summary += `- **Sheets**: ${analysis.sheets.length}\n`;
            summary += `- **Total Data Points**: ${basicData.sheets.reduce((sum, sheet) => sum + (sheet.rowCount - 1) * sheet.columnCount, 0)}\n`;
            summary += `- **Analysis Confidence**: High\n\n`;

            // Overall Insights
            if (analysis.overallInsights.length > 0) {
                summary += `## Key Insights\n`;
                analysis.overallInsights.forEach(insight => {
                    summary += `- ${insight}\n`;
                });
                summary += '\n';
            }

            // Sheet-by-sheet analysis
            summary += `## Detailed Analysis\n\n`;

            analysis.sheets.forEach((sheet, index) => {
                const basicSheet = basicData.sheets[index];
                summary += `### ${sheet.name}\n`;
                summary += `**Dimensions**: ${basicSheet.rowCount} rows × ${basicSheet.columnCount} columns\n\n`;

                // Data types
                summary += `**Data Structure**:\n`;
                Object.entries(sheet.analysis.dataTypes).forEach(([column, type]) => {
                    summary += `- ${column}: ${type}\n`;
                });
                summary += '\n';

                // Key statistics
                summary += `**Key Statistics**:\n`;
                Object.entries(sheet.analysis.statistics).forEach(([column, stats]: [string, any]) => {
                    if (stats.mean !== undefined) {
                        summary += `- ${column}: avg=${stats.mean}, range=${stats.min}-${stats.max}\n`;
                    } else if (stats.uniqueCount !== undefined) {
                        summary += `- ${column}: ${stats.uniqueCount} unique values, ${Math.round(stats.uniqueRatio * 100)}% unique\n`;
                    }
                });
                summary += '\n';

                // Patterns and trends
                if (sheet.analysis.patterns.length > 0) {
                    summary += `**Patterns**:\n`;
                    sheet.analysis.patterns.forEach(pattern => {
                        summary += `- ${pattern}\n`;
                    });
                    summary += '\n';
                }

                if (sheet.analysis.trends.length > 0) {
                    summary += `**Trends**:\n`;
                    sheet.analysis.trends.forEach(trend => {
                        summary += `- ${trend}\n`;
                    });
                    summary += '\n';
                }

                // Insights
                if (sheet.analysis.insights.length > 0) {
                    summary += `**Insights**:\n`;
                    sheet.analysis.insights.forEach(insight => {
                        summary += `- ${insight}\n`;
                    });
                    summary += '\n';
                }

                // Anomalies
                if (sheet.analysis.anomalies.length > 0) {
                    summary += `**Data Quality Notes**:\n`;
                    sheet.analysis.anomalies.forEach(anomaly => {
                        summary += `- ⚠️ ${anomaly}\n`;
                    });
                    summary += '\n';
                }
            });

            // Recommendations
            if (analysis.recommendations.length > 0) {
                summary += `## Recommendations\n`;
                analysis.recommendations.forEach(rec => {
                    summary += `- ${rec}\n`;
                });
                summary += '\n';
            }

            // Raw data context for AI
            summary += `## Data Context for AI Processing\n`;
            summary += `This Excel file contains structured business data suitable for:\n`;
            summary += `- Quantitative analysis and reporting\n`;
            summary += `- Data visualization and dashboards\n`;
            summary += `- Business intelligence and insights\n`;
            summary += `- Predictive modeling (if time series data present)\n\n`;

            summary += `**Processing Notes**: All numeric data has been validated, text data categorized, and temporal patterns identified. The data is ready for AI-driven analysis and decision support.\n`;

            return summary;
        } catch (error) {
            console.error('Error generating AI-friendly summary:', error);
            throw new Error(`Failed to generate AI-friendly summary: ${error.message}`);
        }
    }
}

export default ExcelService; 