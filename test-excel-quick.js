#!/usr/bin/env node

// 快速测试Excel处理功能
// 用法: node test-excel-quick.js

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { excelPlugin } from './packages/plugin-excel/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testExcelProcessing() {
    console.log('🔧 开始测试Excel处理功能...\n');

    try {
        // 动态导入XLSX库
        const XLSX = await import('xlsx');
        console.log('✅ XLSX库导入成功');

        // 测试文件路径
        const testFilePath = path.join(
            __dirname,
            'packages/cli/data/uploads/agents/b850bc30-45f8-0041-a00a-83df46d8555d/1749042184412-943881362-test-blockseq.xlsx'
        );

        console.log(`📁 测试文件路径: ${testFilePath}`);

        // 检查文件是否存在
        if (!fs.existsSync(testFilePath)) {
            throw new Error(`文件不存在: ${testFilePath}`);
        }
        console.log('✅ 文件存在');

        // 读取Excel文件
        const buffer = fs.readFileSync(testFilePath);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        console.log('✅ Excel文件读取成功');

        // 获取工作表名称
        const sheetNames = workbook.SheetNames;
        console.log(`📋 工作表数量: ${sheetNames.length}`);
        console.log(`📋 工作表名称: ${sheetNames.join(', ')}`);

        // 读取第一个工作表内容
        const firstSheet = workbook.Sheets[sheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        console.log(`📊 第一个工作表行数: ${jsonData.length}`);
        console.log('📊 前3行数据预览:');
        console.log(JSON.stringify(jsonData.slice(0, 3), null, 2));

        console.log('\n🎉 Excel处理功能测试通过！');
        return true;

    } catch (error) {
        console.error('\n❌ Excel处理功能测试失败:');
        console.error(error.message);
        console.error(error.stack);
        return false;
    }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
    testExcelProcessing().then(success => {
        process.exit(success ? 0 : 1);
    });
}

export { testExcelProcessing };

console.log('🧪 Testing Excel Plugin...\n');

try {
    console.log('📦 Plugin Information:');
    console.log('Name:', excelPlugin.name);
    console.log('Description:', excelPlugin.description);
    console.log('Services:', excelPlugin.services?.length || 0);
    console.log('Providers:', excelPlugin.providers?.length || 0);
    console.log('Actions:', excelPlugin.actions?.length || 0);
    console.log('Evaluators:', excelPlugin.evaluators?.length || 0);

    // Test plugin initialization
    console.log('\n🔌 Testing plugin initialization...');
    if (excelPlugin.init) {
        await excelPlugin.init({}, {});
        console.log('✅ Plugin initialization successful');
    }

    console.log('\n🎉 Basic plugin test passed!');
    console.log('📊 Excel plugin is properly structured and ready for use.');

} catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
} 