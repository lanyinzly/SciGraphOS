import {
    Action,
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    ModelType,
    logger,
    UUID
} from '@elizaos/core';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

/**
 * Dynamically find the project root directory
 */
function findProjectRoot(): string {
    let currentDir = process.cwd();

    // Special case: if we're currently in packages/cli, go up two levels
    if (currentDir.endsWith('/packages/cli')) {
        const projectRoot = path.dirname(path.dirname(currentDir));
        console.log(`🔍 Found project root from packages/cli: ${projectRoot}`);
        return projectRoot;
    }

    // Walk up the directory tree to find the project root
    while (currentDir !== path.dirname(currentDir)) {
        // Check if this directory contains package.json and packages/cli
        const packageJsonPath = path.join(currentDir, 'package.json');
        const cliPackagePath = path.join(currentDir, 'packages', 'cli');

        if (fs.existsSync(packageJsonPath) && fs.existsSync(cliPackagePath)) {
            console.log(`🔍 Found project root: ${currentDir}`);
            return currentDir;
        }

        currentDir = path.dirname(currentDir);
    }

    // Final fallback: use current working directory
    console.log(`🔍 Using fallback project root: ${process.cwd()}`);
    return process.cwd();
}

// File path resolution function
function getFilePathFromAttachment(attachment: any): string | null {
    console.log(`🔍 Resolving file path: ${attachment.url} -> ...`);

    try {
        if (attachment.url) {
            // Handle local file URLs (including localhost URLs)
            if (attachment.url.startsWith('/media/uploads/') ||
                attachment.url.includes('/media/uploads/')) {

                let relativePath: string;
                if (attachment.url.startsWith('http://localhost:')) {
                    // Extract relative path from localhost URL
                    const urlMatch = attachment.url.match(/\/media\/uploads\/(.+)$/);
                    if (urlMatch) {
                        relativePath = urlMatch[1];
                    } else {
                        console.warn('⚠️ Could not extract path from localhost URL:', attachment.url);
                        return null;
                    }
                } else {
                    // Extract directly from path
                    relativePath = attachment.url.replace('/media/uploads/', '');
                }

                // Detect current working directory and build correct path
                const cwd = process.cwd();
                let resolvedPath: string;

                if (cwd.endsWith('/packages/cli')) {
                    // If already in packages/cli directory, use relative path directly
                    resolvedPath = `data/uploads/${relativePath}`;
                } else {
                    // If in project root directory, need to add packages/cli prefix
                    resolvedPath = `packages/cli/data/uploads/${relativePath}`;
                }

                console.log(`🔍 Working directory: ${cwd}`);
                console.log(`🔍 Resolving file path: ${attachment.url} -> ${path.resolve(cwd, resolvedPath)}`);
                return resolvedPath;
            }

            // Handle other remote URLs - remote download not supported yet
            if (attachment.url.startsWith('http') && !attachment.url.includes('localhost')) {
                console.warn('Remote Excel files not supported yet:', attachment.url);
                return null;
            }
        }

        if (attachment.path) {
            // If path is already absolute, use it directly
            if (attachment.path.startsWith('/') || attachment.path.match(/^[A-Za-z]:/)) {
                return attachment.path;
            }
            // If it's a relative path, check if packages/cli prefix is needed
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

// Check if it's an Excel attachment
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

// Read data from Excel file
async function readExcelData(filePath: string): Promise<any[][]> {
    try {
        console.log(`📁 Reading Excel file from path: ${filePath}`);
        console.log(`📂 Current working directory: ${process.cwd()}`);

        // Convert to absolute path
        let absolutePath: string;
        if (path.isAbsolute(filePath)) {
            absolutePath = filePath;
            console.log(`📍 Using absolute path: ${absolutePath}`);
        } else {
            absolutePath = path.resolve(process.cwd(), filePath);
            console.log(`📍 Resolved to absolute path: ${absolutePath}`);
        }

        console.log(`🔍 Checking if file exists: ${absolutePath}`);
        if (!fs.existsSync(absolutePath)) {
            console.log(`❌ File does not exist at: ${absolutePath}`);
            throw new Error(`Excel file not found: ${absolutePath}`);
        }

        console.log(`✅ File exists, reading Excel data...`);
        // Read Excel file
        const buffer = fs.readFileSync(absolutePath);
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        // Get the first worksheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert to array format
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        logger.info('📊 Excel data read successfully:', {
            sheetName: firstSheetName,
            rows: data.length,
            columns: (data[0] as any[])?.length || 0
        });

        return data;
    } catch (error) {
        logger.error('❌ Failed to read Excel data:', error);
        throw error;
    }
}

// Chart generation function with LLM analysis
const generateChartWithLLM = async (
    runtime: IAgentRuntime,
    excelData: any[][],
    sessionId: string,
    dataDir: string,
    dataSource: string = 'unknown'
): Promise<string> => {
    try {
        logger.info('📊 Starting LLM-powered chart generation...', { sessionId, dataRows: excelData.length });

        // Prepare data analysis prompt
        const dataPreview = excelData.slice(0, 10); // Only send first 10 rows as preview
        const analysisPrompt = `Please analyze the following Excel data and generate appropriate Chart.js chart configuration:

Data preview (first 10 rows):
${JSON.stringify(dataPreview, null, 2)}

Total rows: ${excelData.length}
Columns: ${excelData[0]?.length || 0}

Please:
1. Analyze data characteristics (data types, trends, distribution, etc.)
2. Select the most appropriate chart type (bar, line, pie, doughnut, scatter, bubble, radar, etc.)
3. Generate Chart.js style configuration, including colors, title, labels, etc.
4. No need to include specific data, I will populate with actual Excel data

Return format:
\`\`\`json
{
    "chartType": "chart type (e.g. bar, line, pie, etc.)",
    "analysis": "data analysis results",
    "styleConfig": {
        "backgroundColor": ["color array"],
        "borderColor": ["border color array"],
        "title": "chart title",
        "options": {Chart.js options configuration}
    }
}
\`\`\``;

        // Call LLM to analyze data
        const response = await runtime.useModel(ModelType.TEXT_LARGE, {
            prompt: analysisPrompt,
            temperature: 0.1,
            maxTokens: 2000
        });

        let chartType = 'bar'; // Default value
        let analysis = 'Default analysis';
        let styleConfig: any = {
            backgroundColor: ['rgba(54, 162, 235, 0.8)'],
            borderColor: ['rgba(54, 162, 235, 1)'],
            title: 'Excel Data Visualization',
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        };

        try {
            // Extract JSON configuration
            const jsonMatch = response.match(/```json\s*(\{[\s\S]*?\})\s*```/);
            if (jsonMatch) {
                const llmResponse = JSON.parse(jsonMatch[1]);
                chartType = llmResponse.chartType || 'bar';
                analysis = llmResponse.analysis || 'LLM analysis completed';
                styleConfig = llmResponse.styleConfig || styleConfig;
                logger.info('✅ LLM chart analysis completed', { chartType, analysis });
            } else {
                throw new Error('No valid JSON found in LLM response');
            }
        } catch (error) {
            logger.warn('⚠️ Failed to parse LLM response, using default style config', error);
        }

        // Build Chart.js configuration with actual Excel data
        const chartConfig = {
            type: chartType,
            data: {
                labels: excelData.slice(1).map((row, index) => row[0] || `Row ${index + 1}`),
                datasets: [{
                    label: excelData[0] ? excelData[0][1] || 'Value' : 'Value',
                    data: excelData.slice(1).map(row => parseFloat(row[1]) || 0),
                    backgroundColor: styleConfig.backgroundColor,
                    borderColor: styleConfig.borderColor,
                    borderWidth: 1
                }]
            },
            options: {
                ...styleConfig.options,
                plugins: {
                    ...styleConfig.options?.plugins,
                    title: {
                        display: true,
                        text: styleConfig.title || '📊 Excel Data Visualization'
                    }
                }
            }
        };

        console.log('📊 Final chart config using Excel data:', JSON.stringify(chartConfig, null, 2));

        // Use ElizaOS standard directory structure
        const projectRoot = findProjectRoot();
        const cliRoot = path.join(projectRoot, 'packages/cli');
        const chartDir = path.join(cliRoot, 'generated-html');
        const relationshipDbPath = path.join(cliRoot, 'file-relationships.json');

        // Ensure directory exists
        if (!fs.existsSync(chartDir)) {
            fs.mkdirSync(chartDir, { recursive: true });
        }

        // Generate HTML content with LLM-generated chart
        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Excel Data Chart - ${sessionId}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #333;
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        .chart-container {
            position: relative;
            height: 500px;
            margin: 30px 0;
            background: white;
            border-radius: 15px;
            padding: 20px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        }
        .data-table {
            background: white;
            border-radius: 15px;
            padding: 20px;
            margin-top: 30px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #f8f9fa;
            font-weight: 600;
            color: #333;
        }
        .session-info {
            background: rgba(102, 126, 234, 0.1);
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 20px;
            border-left: 4px solid #667eea;
        }
        .data-source {
            background: ${dataSource === 'excel' ? 'rgba(40, 167, 69, 0.1)' : 'rgba(255, 193, 7, 0.1)'};
            border-left: 4px solid ${dataSource === 'excel' ? '#28a745' : '#ffc107'};
            border-radius: 5px;
            padding: 10px;
            margin-bottom: 15px;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Excel Data Visualization</h1>
            <div class="session-info">
                <strong>Session ID:</strong> ${sessionId}<br>
                <strong>Generated:</strong> ${new Date().toLocaleString()}<br>
                <strong>Data Rows:</strong> ${excelData.length}
            </div>
            <div class="data-source">
                <strong>Data Source:</strong> ${dataSource === 'excel' ? '📄 Excel File' : '🔧 Sample Data (Excel file not found)'}
            </div>
        </div>

        <div class="chart-container">
            <canvas id="myChart"></canvas>
        </div>

        <div class="data-table">
            <h3>📋 Raw Data</h3>
            <table>
                <thead>
                    <tr>
                        ${excelData[0]?.map(header => `<th>${header || ''}</th>`).join('') || ''}
                    </tr>
                </thead>
                <tbody>
                    ${excelData.slice(1).map(row =>
            `<tr>${row.map(cell => `<td>${cell || ''}</td>`).join('')}</tr>`
        ).join('')}
                </tbody>
            </table>
        </div>
    </div>

    <script>
        const ctx = document.getElementById('myChart').getContext('2d');
        const data = ${JSON.stringify(excelData)};
        
        // LLM-generated chart configuration
        const chartConfig = ${JSON.stringify(chartConfig)};
        
        // Initialize chart with LLM configuration
        new Chart(ctx, chartConfig);
    </script>
</body>
</html>`;

        // Generate file name
        const htmlFileName = `chart-${sessionId}.html`;
        const htmlPath = path.join(chartDir, htmlFileName);

        // Save HTML file
        fs.writeFileSync(htmlPath, htmlContent, 'utf8');

        // Update file relationships database
        let relationships = {};
        try {
            if (fs.existsSync(relationshipDbPath)) {
                const data = fs.readFileSync(relationshipDbPath, 'utf8');
                relationships = JSON.parse(data);
            }
        } catch (error) {
            logger.warn('Unable to read file relationships database, creating new one:', error);
        }

        // Add new relationship record
        relationships[sessionId] = {
            sessionId,
            html: {
                fileName: htmlFileName,
                chartType: chartType
            },
            excel: {
                original: 'Excel Data',
                processed: true
            },
            metadata: {
                createdAt: new Date().toISOString(),
                dataRows: excelData.length,
                dataSource: dataSource,
                analysis: analysis
            }
        };

        // Save updated relationships database
        fs.writeFileSync(relationshipDbPath, JSON.stringify(relationships, null, 2), 'utf8');

        logger.info('✅ Chart HTML file generated successfully', { htmlPath, relationshipDbPath });
        return htmlPath;

    } catch (error) {
        logger.error('❌ Chart generation failed:', error);
        throw error;
    }
};

export const chartGeneratorAction: Action = {
    name: 'GENERATE_CHART',
    similes: ['CREATE_CHART', 'CHART_GENERATION', 'EXCEL_CHART', 'DATA_VISUALIZATION'],
    description: 'Generate data charts based on Excel files',

    validate: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<boolean> => {
        try {
            logger.info('🔍 Validating chart generation request...', {
                messageId: message.id,
                hasAttachments: !!(message.content?.attachments?.length),
                attachmentCount: message.content?.attachments?.length || 0
            });

            // Check if there are Excel attachments
            const hasExcelAttachment = message.content?.attachments?.some(isExcelAttachment) || false;

            // Check keywords in text content
            const textContent = message.content.text || message.content.content || '';
            const text = typeof textContent === 'string' ? textContent.toLowerCase() : '';
            logger.info('📝 Checking text content:', { text });

            // Check if it contains chart-related keywords
            const chartKeywords = ['chart', 'visualization', 'generate', 'graph', 'plot', 'visual'];
            const matchedKeywords = chartKeywords.filter(keyword => text.includes(keyword));
            const hasChartKeyword = matchedKeywords.length > 0;

            logger.info('🔍 Validation results:', {
                hasExcelAttachment,
                hasChartKeyword,
                matchedKeywords,
                shouldGenerate: hasExcelAttachment && hasChartKeyword,
                textLength: text.length
            });

            if (hasExcelAttachment && hasChartKeyword) {
                logger.info('✅ Chart generation action validation passed - chart request detected');
                return true;
            } else {
                logger.info('❌ Chart generation action validation failed - missing Excel attachment or chart keywords');
                return false;
            }
        } catch (error) {
            logger.error('❌ Chart generation action validation failed:', error);
            return false;
        }
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State | undefined,
        options: any,
        callback?: HandlerCallback,
        responses?: Memory[]
    ): Promise<unknown> => {
        try {
            logger.info('📊 Chart generator action triggered!');

            // Generate session ID
            const sessionId = uuidv4();
            logger.info('🆔 Generated session ID:', sessionId);

            // Set up data directory
            const dataDir = path.join(process.cwd(), 'packages/cli/data');
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // Read data from Excel attachments
            let excelData: any[][] | null = null;
            let dataSource = 'none';

            const attachments = message.content?.attachments;
            if (!attachments || attachments.length === 0) {
                throw new Error('❌ No Excel file attachment found. Please upload an Excel file to generate a chart.');
            }

            // Find Excel attachments and read data
            for (const attachment of attachments) {
                if (isExcelAttachment(attachment)) {
                    const filePath = getFilePathFromAttachment(attachment);
                    if (!filePath) {
                        throw new Error('❌ Failed to resolve Excel file path from attachment.');
                    }

                    const absolutePath = path.resolve(process.cwd(), filePath);
                    if (!fs.existsSync(absolutePath)) {
                        throw new Error(`❌ Excel file not found at path: ${absolutePath}. Please check the file upload.`);
                    }

                    try {
                        excelData = await readExcelData(filePath);
                        dataSource = 'excel';
                        logger.info('✅ Successfully read data from Excel file:', {
                            filePath,
                            rows: excelData.length
                        });
                        break;
                    } catch (error) {
                        throw new Error(`❌ Failed to read Excel file: ${error.message}`);
                    }
                }
            }

            // If no Excel attachment found
            if (!excelData) {
                throw new Error('❌ No valid Excel file found in attachments. Please upload a .xlsx, .xls, or .csv file.');
            }

            logger.info('📊 Processing Excel data:', { rows: excelData.length, source: dataSource });

            // Generate chart
            const chartPath = await generateChartWithLLM(runtime, excelData, sessionId, dataDir, dataSource);

            // Generate access URL
            const viewUrl = `http://localhost:3000/view/${sessionId}`;

            logger.info('🔗 Chart generated successfully:', {
                sessionId,
                chartPath,
                viewUrl,
                dataSource
            });

            // Modify current responseMessage content via callback
            const chartResponse = {
                thought: `I have successfully analyzed the user's Excel data (${excelData.length} rows), used LLM to select an appropriate chart type, and generated a visualization chart. The chart has been saved and can be accessed via link.`,
                text: `📊 Chart generation completed! I have created an intelligent visualization chart based on your Excel data.

🔗 **View Chart**: ${viewUrl}

📋 **Data Details**:
• Data Source: Excel file (${excelData.length} rows)
• Chart Type: Intelligently selected by AI analysis
• Session ID: ${sessionId}

Click the link above to view your data visualization chart!`,
                actions: ['GENERATE_CHART'],
                inReplyTo: message.id
            };

            // Modify message content in responses array
            if (responses && responses.length > 0) {
                responses[0].content = {
                    ...responses[0].content,
                    ...chartResponse
                };
                logger.info('✅ Modified existing response message with chart link');
            } else if (callback) {
                // If no responses, pass through callback
                await callback(chartResponse);
                logger.info('✅ Chart response sent via callback');
            }

            logger.info('✅ Chart link integrated into agent response');

            return {
                success: true,
                sessionId,
                viewUrl,
                dataSource,
                chartPath,
                dataRows: excelData.length
            };

        } catch (error) {
            logger.error('❌ Chart generation failed:', error);

            // Notify LLM via callback even if failed
            if (callback) {
                const errorResponse = {
                    thought: `Error encountered during chart generation: ${error.message}`,
                    text: `❌ Sorry, chart generation failed: ${error.message}`,
                    actions: ['GENERATE_CHART']
                };
                await callback(errorResponse);
            }

            return false;
        }
    },

    examples: [
        [
            {
                name: 'User',
                content: {
                    text: 'Please generate a chart for my Excel data',
                },
            },
            {
                name: 'Assistant',
                content: {
                    text: 'I will generate a visualization chart for your Excel data.',
                    actions: ['GENERATE_CHART'],
                },
            },
        ],
        [
            {
                name: 'User',
                content: {
                    text: 'Can you help me create a data visualization chart?',
                },
            },
            {
                name: 'Assistant',
                content: {
                    text: 'Of course! I will analyze your data and create a chart.',
                    actions: ['GENERATE_CHART'],
                },
            },
        ],
    ] as ActionExample[][],
} as Action;

export default chartGeneratorAction; 