import fs from 'fs';
import FormData from 'form-data';
import axios from 'axios';
import path from 'path';

// 测试 Excel 上传功能
async function testExcelUpload() {
    try {
        console.log('🧪 Testing Excel upload functionality...');

        // 检查测试文件是否存在
        const testFile = 'test-blockseq.xlsx';
        if (!fs.existsSync(testFile)) {
            console.error('❌ Test Excel file not found:', testFile);
            console.log('Please create a test Excel file first.');
            return;
        }

        // 创建 FormData
        const form = new FormData();
        form.append('file', fs.createReadStream(testFile));

        // 使用默认的 agent ID (从之前的日志中看到的)
        const agentId = 'b850bc30-45f8-0041-a00a-83df46d8555d';
        const uploadUrl = `http://localhost:3000/api/agents/${agentId}/upload-media`;

        console.log('📤 Uploading Excel file to:', uploadUrl);

        // 发送上传请求
        const response = await axios.post(uploadUrl, form, {
            headers: {
                ...form.getHeaders(),
            },
            timeout: 30000, // 30 seconds timeout
        });

        console.log('✅ Upload successful!');
        console.log('📊 Response data:', JSON.stringify(response.data, null, 2));

        // 检查响应是否包含 Excel 数据
        if (response.data.data?.excelData) {
            console.log('🎉 Excel processing successful!');
            console.log('📈 Sheets found:', response.data.data.excelData.totalSheets);

            if (response.data.data.excelData.sheets) {
                response.data.data.excelData.sheets.forEach((sheet, index) => {
                    console.log(`   Sheet ${index + 1}: ${sheet.name} (${sheet.rowCount} rows, ${sheet.columnCount} columns)`);
                });
            }

            // 检查是否生成了图表
            if (response.data.data.excelData.charts) {
                console.log('📊 Charts generated successfully!');
                response.data.data.excelData.charts.forEach((chart, index) => {
                    if (typeof chart === 'object' && chart.url) {
                        console.log(`   Chart ${index + 1}: ${chart.title} (${chart.type})`);
                        console.log(`   URL: ${chart.url}`);
                    } else {
                        console.log(`   Chart ${index + 1}: ${chart}`);
                    }
                });
            } else {
                console.log('📊 No charts generated (may not contain numeric data)');
            }
        } else {
            console.log('⚠️  Excel file uploaded but not processed');
        }

    } catch (error) {
        console.error('❌ Upload failed:', error.message);

        if (error.response) {
            console.error('📄 Response status:', error.response.status);
            console.error('📄 Response data:', error.response.data);
        }
    }
}

// 运行测试
testExcelUpload(); 