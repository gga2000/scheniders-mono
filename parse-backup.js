const ExcelJS = require('exceljs');

async function parseExcel() {
    const filePath = '/Users/ali/Scheniders/scheniders_backup_2026-02-28.xlsx';

    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);

        const worksheet = workbook.worksheets[0]; // Assuming data is in the first sheet
        let headerRow = [];
        let confirmedOrderIds = [];

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) {
                // Read headers
                row.eachCell((cell, colNumber) => {
                    headerRow[colNumber] = cell.value?.toString().toLowerCase();
                });
            } else {
                // Find index of 'status' and 'order_id' or 'id'
                const statusColIdx = headerRow.findIndex(h => h && h.includes('status') || h === 'حالة الطلب' || h === 'الحالة');
                const orderIdColIdx = headerRow.findIndex(h => h && h.includes('id') || h === 'رقم الطلب');

                if (statusColIdx !== -1 && orderIdColIdx !== -1) {
                    const statusVal = row.getCell(statusColIdx).value?.toString()?.toLowerCase();

                    if (statusVal === 'confirmed' || statusVal === 'مؤكد') {
                        const orderIdVal = row.getCell(orderIdColIdx).value?.toString();
                        if (orderIdVal) {
                            confirmedOrderIds.push(orderIdVal);
                        }
                    }
                } else {
                    // fallback if headers are different - just look for 'confirmed' or 'مؤكد' anywhere in row
                    let hasConfirmed = false;
                    let possibleId = null;
                    row.eachCell((cell) => {
                        const val = cell.value?.toString()?.toLowerCase();
                        if (val === 'confirmed' || val === 'مؤكد') {
                            hasConfirmed = true;
                        }
                        // Check if it looks like an order ID (starts with CHK or just numbers)
                        if (val && (val.startsWith('chk-') || val.startsWith('chk') || /^[a-f0-9-]{36}$/i.test(val) || /^[0-9]{5,}$/.test(val))) {
                            possibleId = cell.value?.toString();
                        }
                    });
                    if (hasConfirmed && possibleId) {
                        confirmedOrderIds.push(possibleId);
                    }
                }
            }
        });

        console.log(`Found ${confirmedOrderIds.length} confirmed orders in the backup.`);
        if (confirmedOrderIds.length > 0) {
            console.log('Sample IDs:', confirmedOrderIds.slice(0, 10));
            const fs = require('fs');
            fs.writeFileSync('/tmp/missing_confirmed_orders.json', JSON.stringify(confirmedOrderIds, null, 2));
            console.log('Saved all confirmed IDs to /tmp/missing_confirmed_orders.json');
        } else {
            // If we didn't find any, dump the headers to see what they are
            console.log('Headers found:', headerRow);
            // Dump the first actual row to see data structure
            let firstRowData = [];
            worksheet.getRow(2).eachCell((cell) => {
                firstRowData.push(cell.value?.toString());
            });
            console.log('Sample row data:', firstRowData);
        }

    } catch (error) {
        console.error('Error reading Excel file:', error);
    }
}

parseExcel();
