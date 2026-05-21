import ExcelJS from 'exceljs';

export const extractImagesFromExcel = async (file: File): Promise<Map<number, Blob>> => {
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = await file.arrayBuffer();

    // Load workbook
    await workbook.xlsx.load(arrayBuffer);

    // Get first sheet
    const worksheet = workbook.getWorksheet(1);

    if (!worksheet) {
        return new Map();
    }

    const imageMap = new Map<number, Blob>();

    // Iterate over images
    const images = worksheet.getImages();
    images.forEach((image) => {
        // Warning: exceljs image ranges might precise or float.
        // We assume 'tl' (top-left) anchor defines the cell it belongs to.
        // tl.nativeRow matches the 0-based row index.
        // Note: Header is usually row 0.
        // If data starts at row 1 (index 1), we map index 1 to our data array index 0?
        // Let's check how xlsx works. xlsx sheet_to_json usually treats first row as header.
        // So data row 1 in Excel (index 1) is index 0 in json result?
        // Wait, Header is Row 1 (index 0) in Excel?
        // ExcelJS: Row 1 is 1-based index 1.
        // 'tl.nativeRow' is 0-based index. 
        // So if Header is at index 0 (Row 1), Data starts at index 1 (Row 2).
        // xlsx sheet_to_json returns array starting from Data Row 1 (index 1).
        // So image at index 1 matches json data at index 0.
        // We need to adjust: rowIndex = image.range.tl.nativeRow - 1.

        const rowIndex = Math.floor(image.range.tl.nativeRow) - 1;

        if (rowIndex >= 0) {
            const imgId = image.imageId;
            // @ts-expect-error - access internal media which is not fully typed in ExcelJS
            const img = workbook.model.media.find(m => m.index === imgId);

            if (img) {
                const blob = new Blob([img.buffer], { type: 'image/' + img.extension });
                // Support png, jpeg, etc. extension usually 'png' or 'jpeg'
                imageMap.set(rowIndex, blob);
            }
        }
    });

    return imageMap;
};
