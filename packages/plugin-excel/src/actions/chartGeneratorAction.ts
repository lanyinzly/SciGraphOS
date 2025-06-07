import {
    Action,
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    ModelType,
    logger
} from '@elizaos/core';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Chart generation function
const generateChart = async (
    excelData: any[][],
    sessionId: string,
    dataDir: string
): Promise<string> => {
    try {
        logger.info('📊 Starting chart generation...', { sessionId, dataRows: excelData.length });

        // Use ElizaOS standard directory structure
        const projectRoot = '/Volumes/Code/Projects/AI/blockSeq';
        const cliRoot = path.join(projectRoot, 'packages/cli');
        const chartDir = path.join(cliRoot, 'generated-html');
        const relationshipDbPath = path.join(cliRoot, 'file-relationships.json');

        // Ensure directory exists
        if (!fs.existsSync(chartDir)) {
            fs.mkdirSync(chartDir, { recursive: true });
        }

        // Generate HTML content
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
        
        // Process data
        const labels = data.slice(1).map((row, index) => row[0] || \`Row\${index + 1}\`);
        const values = data.slice(1).map(row => parseFloat(row[1]) || 0);
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: data[0] ? data[0][1] || 'Value' : 'Value',
                    data: values,
                    backgroundColor: 'rgba(54, 162, 235, 0.8)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: '📊 Excel Data Visualization'
                    }
                }
            }
        });
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
                chartType: 'bar'
            },
            excel: {
                original: 'Excel Data',
                processed: true
            },
            metadata: {
                createdAt: new Date().toISOString(),
                dataRows: excelData.length
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
                content: message.content
            });

            // Check multiple possible text fields
            const textContent = message.content.text || message.content.content || '';
            const text = typeof textContent === 'string' ? textContent.toLowerCase() : '';
            logger.info('📝 Checking text content:', { text });

            // Check if contains chart-related keywords
            const chartKeywords = ['图表', 'chart', '可视化', 'visualization', '生成', 'generate'];
            const matchedKeywords = chartKeywords.filter(keyword => text.includes(keyword));
            const hasChartKeyword = matchedKeywords.length > 0;

            logger.info('🔍 Keyword matching results:', {
                chartKeywords,
                matchedKeywords,
                hasChartKeyword,
                textLength: text.length
            });

            if (hasChartKeyword) {
                logger.info('✅ Chart generation action validation passed');
                return true;
            } else {
                logger.info('❌ Chart generation action validation failed - no matching keywords found');
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

            // Sample Excel data (should read from file in real application)
            const excelData = [
                ['Category', 'Value', 'Description'],
                ['Product A', 120, 'Hot selling product'],
                ['Product B', 85, 'Stable sales'],
                ['Product C', 95, 'New product promotion'],
                ['Product D', 140, 'Best seller'],
                ['Product E', 60, 'Needs improvement']
            ];

            logger.info('📊 Processing Excel data:', { rows: excelData.length });

            // Generate chart
            const chartPath = await generateChart(excelData, sessionId, dataDir);

            // Generate access URL
            const viewUrl = `http://localhost:3000/view/${sessionId}`;

            logger.info('🔗 Chart generated successfully:', {
                sessionId,
                chartPath,
                viewUrl
            });

            // Construct response content - use user specified correct format
            const responseText = `🖼️ View chart: http://localhost:3000/view/${sessionId}
📄 Download image: http://localhost:3000/images/${sessionId}.png
🎯 Chart gallery: http://localhost:3000/gallery`;

            // Call callback to return result
            if (callback) {
                logger.info('📤 Calling callback with chart response');
                await callback({
                    text: responseText,
                    actions: ['GENERATE_CHART'],
                    source: message.content.source,
                });
                logger.info('✅ Callback completed successfully');
            }

            logger.info('✅ Chart generation completed successfully');

            // Return Content object - this is key!
            return {
                text: responseText,
                actions: ['GENERATE_CHART'],
                source: message.content.source,
            };

        } catch (error) {
            logger.error('❌ Chart generation failed:', error);

            // Error callback
            if (callback) {
                await callback({
                    text: '❌ Sorry, an error occurred during chart generation. Please try again later.',
                    actions: ['GENERATE_CHART_ERROR'],
                    source: message.content.source,
                });
                logger.info('✅ Error callback completed');
            }

            // Return error content
            return {
                text: '❌ Sorry, an error occurred during chart generation. Please try again later.',
                actions: ['GENERATE_CHART_ERROR'],
                source: message.content.source,
            };
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