/**
 * Exports data to a CSV file and triggers a download.
 *
 * @param filename - The name of the file to be downloaded (without .csv extension).
 * @param headers - Array of string headers for the CSV columns.
 * @param rows - Array of string arrays, where each inner array represents a row of data.
 */
export const downloadCSV = (filename: string, headers: string[], rows: string[][]) => {
    if (rows.length === 0) return;

    // Join each row's columns with a semicolon
    const csvRows = rows.map(row => row.join(';'));
    
    // Combine headers and rows
    const csvContent = [headers.join(';'), ...csvRows].join('\n');
    
    // Add BOM for UTF-8 Excel compatibility
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Trigger download
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
};
