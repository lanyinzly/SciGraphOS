import {
    IAgentRuntime,
    Memory,
    Provider,
    ProviderResult,
    State,
} from '@elizaos/core';
import { ExcelService } from '../services/excelService.js';

/**
 * Excel Provider
 * Automatically detects and processes Excel attachments in messages
 * Extracts content for AI analysis
 */
export const excelProvider: Provider = {
    name: 'EXCEL_PROVIDER',
    description: 'Processes Excel file attachments and extracts their content for AI analysis',

    get: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state?: State
    ): Promise<ProviderResult> => {
        const excelService = runtime.getService<ExcelService>('excel');

        if (!excelService) {
            return {
                text: '',
                values: {},
                data: {},
            };
        }

        // Check if message has attachments
        if (!message.content?.attachments || message.content.attachments.length === 0) {
            return {
                text: '',
                values: {},
                data: {},
            };
        }

        let extractedContent = '';
        const processedFiles: any[] = [];

        // Process each attachment
        for (const attachment of message.content.attachments) {
            try {
                // Check if this is an Excel file
                if (!isExcelAttachment(attachment)) {
                    continue;
                }

                const filePath = getFilePathFromAttachment(attachment);
                if (!filePath) {
                    continue;
                }

                // Check if file exists and is valid Excel
                if (!ExcelService.isExcelFile(filePath)) {
                    continue;
                }

                // Generate AI-friendly summary with intelligent analysis
                const aiSummary = await excelService.generateAIFriendlySummary(filePath);

                // Get file info for metadata
                const fileInfo = await excelService.getExcelInfo(filePath);

                // Use the AI-friendly summary as the main content
                extractedContent += `\n${aiSummary}\n`;
                extractedContent += `\n--- End of ${fileInfo.fileName} Analysis ---\n`;

                processedFiles.push({
                    fileName: fileInfo.fileName,
                    fileSize: fileInfo.fileSize,
                    sheetCount: fileInfo.sheetCount,
                    sheetNames: fileInfo.sheetNames,
                    summary: `AI-enhanced analysis with ${fileInfo.sheetCount} sheets`,
                    hasContent: aiSummary.length > 0
                });

            } catch (error) {
                console.error('Error processing Excel file:', error);
                extractedContent += `\n⚠️ Error processing Excel file: ${error.message}\n`;
            }
        }

        if (extractedContent.trim()) {
            return {
                text: `The user has shared Excel file(s) with the following content:\n${extractedContent}`,
                values: {
                    excelFilesCount: processedFiles.length,
                    processedFiles: processedFiles
                },
                data: {
                    excelAttachments: processedFiles
                },
            };
        }

        return {
            text: '',
            values: {},
            data: {},
        };
    },
};

/**
 * Check if attachment is an Excel file
 */
function isExcelAttachment(attachment: any): boolean {
    if (!attachment) return false;

    // Check MIME type
    if (attachment.mimeType) {
        return attachment.mimeType === 'application/vnd.ms-excel' ||
            attachment.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    // Check file extension
    if (attachment.url || attachment.filename) {
        const filename = attachment.filename || attachment.url;
        const ext = filename.toLowerCase().split('.').pop();
        return ext === 'xlsx' || ext === 'xls';
    }

    return false;
}

/**
 * Extract file path from attachment
 */
function getFilePathFromAttachment(attachment: any): string | null {
    try {
        if (attachment.url) {
            // Handle local file URLs like /media/uploads/agents/...
            if (attachment.url.startsWith('/media/uploads/')) {
                // Convert URL to actual file path (service runs from packages/cli/)
                const relativePath = attachment.url.replace('/media/uploads/', '');
                return `packages/cli/data/uploads/${relativePath}`;
            }

            // Handle full URLs - would need to download first
            if (attachment.url.startsWith('http')) {
                // For now, we don't support remote URLs
                console.warn('Remote Excel files not supported yet:', attachment.url);
                return null;
            }
        }

        if (attachment.path) {
            // If path is already absolute, use it directly
            if (attachment.path.startsWith('/') || attachment.path.match(/^[A-Za-z]:/)) {
                return attachment.path;
            }
            // If relative path, check if it needs packages/cli prefix
            if (attachment.path.startsWith('data/uploads/')) {
                return `packages/cli/${attachment.path}`;
            }
            return attachment.path;
        }

        return null;
    } catch (error) {
        console.error('Error extracting file path from attachment:', error);
        return null;
    }
}

export default excelProvider; 