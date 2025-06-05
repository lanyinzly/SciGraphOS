import XLSX from 'xlsx';

// 创建测试 Excel 文件
function createTestExcel() {
    console.log('📊 Creating test Excel file...');

    // 创建工作簿
    const workbook = XLSX.utils.book_new();

    // 销售数据工作表
    const salesData = [
        ['Product', 'Category', 'Sales', 'Profit', 'Date'],
        ['Laptop', 'Electronics', 1200, 300, '2024-01-15'],
        ['Mouse', 'Electronics', 25, 10, '2024-01-16'],
        ['Keyboard', 'Electronics', 75, 25, '2024-01-17'],
        ['Monitor', 'Electronics', 350, 100, '2024-01-18'],
        ['Desk', 'Furniture', 200, 50, '2024-01-19'],
        ['Chair', 'Furniture', 150, 40, '2024-01-20'],
        ['Notebook', 'Stationery', 5, 2, '2024-01-21'],
        ['Pen', 'Stationery', 2, 1, '2024-01-22'],
    ];

    // 客户数据工作表
    const customerData = [
        ['Customer ID', 'Name', 'Email', 'City', 'Total Orders'],
        ['C001', 'John Smith', 'john@email.com', 'New York', 5],
        ['C002', 'Jane Doe', 'jane@email.com', 'Los Angeles', 3],
        ['C003', 'Bob Johnson', 'bob@email.com', 'Chicago', 7],
        ['C004', 'Alice Brown', 'alice@email.com', 'Houston', 2],
        ['C005', 'Charlie Wilson', 'charlie@email.com', 'Phoenix', 4],
    ];

    // 汇总数据工作表
    const summaryData = [
        ['Metric', 'Value'],
        ['Total Sales', 2007],
        ['Total Profit', 528],
        ['Total Products', 8],
        ['Total Customers', 5],
        ['Average Order Value', 250.875],
        ['Profit Margin', '26.3%'],
    ];

    // 创建工作表
    const salesSheet = XLSX.utils.aoa_to_sheet(salesData);
    const customerSheet = XLSX.utils.aoa_to_sheet(customerData);
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(workbook, salesSheet, 'Sales Data');
    XLSX.utils.book_append_sheet(workbook, customerSheet, 'Customers');
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // 保存文件
    const filename = 'test-blockseq.xlsx';
    XLSX.writeFile(workbook, filename);

    console.log(`✅ Test Excel file created: ${filename}`);
    console.log('📈 Contains 3 sheets:');
    console.log('   - Sales Data (8 products)');
    console.log('   - Customers (5 customers)');
    console.log('   - Summary (6 metrics)');
}

// 运行创建函数
try {
    createTestExcel();
} catch (error) {
    console.error('❌ Failed to create Excel file:', error.message);
    console.log('💡 Make sure xlsx package is installed: npm install xlsx');
} 