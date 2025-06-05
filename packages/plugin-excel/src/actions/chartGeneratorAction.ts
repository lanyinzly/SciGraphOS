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

// 图表生成函数
const generateChart = async (
    excelData: any[][],
    sessionId: string,
    dataDir: string
): Promise<string> => {
    try {
        logger.info('📊 开始生成图表...', { sessionId, dataRows: excelData.length });

        // 使用ElizaOS的标准目录结构
        const projectRoot = '/Volumes/Code/Projects/AI/blockSeq';
        const cliRoot = path.join(projectRoot, 'packages/cli');
        const chartDir = path.join(cliRoot, 'generated-html');
        const relationshipDbPath = path.join(cliRoot, 'file-relationships.json');

        // 确保目录存在
        if (!fs.existsSync(chartDir)) {
            fs.mkdirSync(chartDir, { recursive: true });
        }

        // 生成HTML内容
        const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Excel数据图表 - ${sessionId}</title>
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
            <h1>📊 Excel数据可视化</h1>
            <div class="session-info">
                <strong>会话ID:</strong> ${sessionId}<br>
                <strong>生成时间:</strong> ${new Date().toLocaleString()}<br>
                <strong>数据行数:</strong> ${excelData.length}
            </div>
        </div>

        <div class="chart-container">
            <canvas id="myChart"></canvas>
        </div>

        <div class="data-table">
            <h3>📋 原始数据</h3>
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
        
        // 处理数据
        const labels = data.slice(1).map((row, index) => row[0] || \`行\${index + 1}\`);
        const values = data.slice(1).map(row => parseFloat(row[1]) || 0);
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: data[0] ? data[0][1] || '数值' : '数值',
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
                        text: '📊 Excel数据可视化'
                    }
                }
            }
        });
    </script>
</body>
</html>`;

        // 生成文件名
        const htmlFileName = `chart-${sessionId}.html`;
        const htmlPath = path.join(chartDir, htmlFileName);

        // 保存HTML文件
        fs.writeFileSync(htmlPath, htmlContent, 'utf8');

        // 更新文件关系数据库
        let relationships = {};
        try {
            if (fs.existsSync(relationshipDbPath)) {
                const data = fs.readFileSync(relationshipDbPath, 'utf8');
                relationships = JSON.parse(data);
            }
        } catch (error) {
            logger.warn('无法读取文件关系数据库，创建新的:', error);
        }

        // 添加新的关系记录
        relationships[sessionId] = {
            sessionId,
            html: {
                fileName: htmlFileName,
                chartType: 'bar'
            },
            excel: {
                original: 'Excel数据',
                processed: true
            },
            metadata: {
                createdAt: new Date().toISOString(),
                dataRows: excelData.length
            }
        };

        // 保存更新的关系数据库
        fs.writeFileSync(relationshipDbPath, JSON.stringify(relationships, null, 2), 'utf8');

        logger.info('✅ 图表HTML文件已生成', { htmlPath, relationshipDbPath });
        return htmlPath;

    } catch (error) {
        logger.error('❌ 图表生成失败:', error);
        throw error;
    }
};

export const chartGeneratorAction: Action = {
    name: 'GENERATE_CHART',
    similes: ['CREATE_CHART', 'CHART_GENERATION', 'EXCEL_CHART', 'DATA_VISUALIZATION'],
    description: '根据Excel文件生成数据图表',

    validate: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<boolean> => {
        try {
            logger.info('🔍 验证图表生成请求...', {
                messageId: message.id,
                content: message.content
            });

            // 检查多个可能的文本字段
            const textContent = message.content.text || message.content.content || '';
            const text = typeof textContent === 'string' ? textContent.toLowerCase() : '';
            logger.info('📝 检查的文本内容:', { text });

            // 检查是否包含图表相关关键词
            const chartKeywords = ['图表', 'chart', '可视化', 'visualization', '生成', 'generate'];
            const matchedKeywords = chartKeywords.filter(keyword => text.includes(keyword));
            const hasChartKeyword = matchedKeywords.length > 0;

            logger.info('🔍 关键词匹配结果:', {
                chartKeywords,
                matchedKeywords,
                hasChartKeyword,
                textLength: text.length
            });

            if (hasChartKeyword) {
                logger.info('✅ 图表生成action验证通过');
                return true;
            } else {
                logger.info('❌ 图表生成action验证失败 - 未找到匹配关键词');
                return false;
            }
        } catch (error) {
            logger.error('❌ 图表生成action验证失败:', error);
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

            // 生成会话ID
            const sessionId = uuidv4();
            logger.info('🆔 Generated session ID:', sessionId);

            // 设置数据目录
            const dataDir = path.join(process.cwd(), 'packages/cli/data');
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // 模拟Excel数据（实际应用中应该从文件读取）
            const excelData = [
                ['类别', '数值', '描述'],
                ['产品A', 120, '热销产品'],
                ['产品B', 85, '稳定销量'],
                ['产品C', 95, '新品推广'],
                ['产品D', 140, '爆款产品'],
                ['产品E', 60, '待提升']
            ];

            logger.info('📊 Processing Excel data:', { rows: excelData.length });

            // 生成图表
            const chartPath = await generateChart(excelData, sessionId, dataDir);

            // 生成访问链接
            const viewUrl = `http://localhost:3000/view/${sessionId}`;

            logger.info('🔗 Chart generated successfully:', {
                sessionId,
                chartPath,
                viewUrl
            });

            // 构造响应内容 - 使用用户指定的正确格式
            const responseText = `🖼️ 查看图表: http://localhost:3000/view/${sessionId}
📄 下载图片: http://localhost:3000/images/${sessionId}.png
🎯 图表库: http://localhost:3000/gallery`;

            // 调用callback返回结果
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

            // 返回Content对象 - 这是关键！
            return {
                text: responseText,
                actions: ['GENERATE_CHART'],
                source: message.content.source,
            };

        } catch (error) {
            logger.error('❌ Chart generation failed:', error);

            // 错误回调
            if (callback) {
                await callback({
                    text: '❌ 抱歉，图表生成过程中出现错误。请稍后重试。',
                    actions: ['GENERATE_CHART_ERROR'],
                    source: message.content.source,
                });
                logger.info('✅ Error callback completed');
            }

            // 返回错误内容
            return {
                text: '❌ 抱歉，图表生成过程中出现错误。请稍后重试。',
                actions: ['GENERATE_CHART_ERROR'],
                source: message.content.source,
            };
        }
    },

    examples: [
        [
            {
                name: '用户',
                content: {
                    text: '请为我的Excel数据生成图表',
                },
            },
            {
                name: 'AI助手',
                content: {
                    text: '我将为您的Excel数据生成可视化图表。',
                    actions: ['GENERATE_CHART'],
                },
            },
        ],
        [
            {
                name: '用户',
                content: {
                    text: '能帮我创建一个数据可视化图表吗？',
                },
            },
            {
                name: 'AI助手',
                content: {
                    text: '当然可以！我会分析您的数据并创建图表。',
                    actions: ['GENERATE_CHART'],
                },
            },
        ],
    ] as ActionExample[][],
} as Action;

export default chartGeneratorAction; 