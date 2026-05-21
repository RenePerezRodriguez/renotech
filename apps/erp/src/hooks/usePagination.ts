import { useState, useMemo } from 'react';

export function usePagination<T>(data: T[], defaultPerPage = 10) {
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(defaultPerPage);
    const [prevKey, setPrevKey] = useState(`${data.length}|${itemsPerPage}`);

    const key = `${data.length}|${itemsPerPage}`;
    if (prevKey !== key) {
        setPrevKey(key);
        setCurrentPage(1);
    }

    const totalPages = Math.ceil(data.length / itemsPerPage);

    const paginatedData = useMemo(
        () => data.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
        [data, currentPage, itemsPerPage]
    );

    return {
        currentPage,
        setCurrentPage,
        itemsPerPage,
        setItemsPerPage,
        totalPages,
        paginatedData,
    };
}
