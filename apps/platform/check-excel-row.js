const ExcelJS = require('exceljs');

async function checkRow() {
    const filePath = '/Users/ali/Scheniders/scheniders_backup_2026-02-28.xlsx';
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];

    let headerRow = [];
    worksheet.getRow(1).eachCell((cell, colNumber) => {
        headerRow[colNumber] = cell.value?.toString();
    });

    let firstDataRow = [];
    worksheet.getRow(2).eachCell((cell, colNumber) => {
        firstDataRow[colNumber] = cell.value?.toString();
    });

    console.log('Headers:', headerRow.filter(Boolean));
    console.log('Row 2:', firstDataRow.filter(Boolean));
}
checkRow();
