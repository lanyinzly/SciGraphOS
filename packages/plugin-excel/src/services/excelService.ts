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
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

            if (!fs.existsSync(absolutePath)) {
                throw new Error(`Excel file not found: ${filePath}`);
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
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

            if (!fs.existsSync(absolutePath)) {
                throw new Error(`Excel file not found: ${filePath}`);
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
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

            if (!fs.existsSync(absolutePath)) {
                throw new Error(`Excel file not found: ${filePath}`);
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
}

export default ExcelService; 