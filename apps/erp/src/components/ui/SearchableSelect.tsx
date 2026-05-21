'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import Image from 'next/image';

export interface Option {
    label: string;
    value: string;
    icon?: string; // Flag URL or icon
    group?: string; // Continent/Category
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    searchPlaceholder?: string;
    disabled?: boolean;
    loading?: boolean;
    grouped?: boolean;
}

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder,
    searchPlaceholder = "Buscar...",
    disabled = false,
    loading = false,
    grouped = false
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [search, setSearch] = useState("");
    const [userExpandedGroups, setUserExpandedGroups] = useState<Set<string>>(new Set());
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, direction: 'down' as 'up' | 'down' });

    useEffect(() => {
        const frame = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    const selectedOption = useMemo(() => options.find(o => o.value === value), [options, value]);

    const filteredOptions = useMemo(() => {
        const query = search.toLowerCase();
        return options.filter(o =>
            o.label.toLowerCase().includes(query) ||
            (o.group && o.group.toLowerCase().includes(query))
        );
    }, [options, search]);

    const groupedOptions = useMemo(() => {
        if (!grouped) return { "": filteredOptions };
        const groups: Record<string, Option[]> = {};
        filteredOptions.forEach(opt => {
            const group = opt.group || "Otros";
            if (!groups[group]) groups[group] = [];
            groups[group].push(opt);
        });
        return groups;
    }, [filteredOptions, grouped]);

    const effectiveExpandedGroups = useMemo(() => {
        if (search.trim()) {
            return new Set(Object.keys(groupedOptions));
        }
        return userExpandedGroups;
    }, [search, groupedOptions, userExpandedGroups]);

    useEffect(() => {
        const updateCoords = () => {
            if (containerRef.current && isOpen) {
                const rect = containerRef.current.getBoundingClientRect();
                const dropdownHeight = 350; // Estimated max height
                const spaceBelow = window.innerHeight - rect.bottom;
                const shouldOpenUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

                // position:fixed coords are viewport-relative — do NOT add scrollY/scrollX
                setCoords({
                    top: shouldOpenUp ? rect.top : rect.bottom,
                    left: rect.left,
                    width: rect.width,
                    direction: shouldOpenUp ? 'up' : 'down'
                });
            }
        };

        if (isOpen) {
            updateCoords();
            window.addEventListener('scroll', updateCoords, true);
            window.addEventListener('resize', updateCoords);
        }
        return () => {
            window.removeEventListener('scroll', updateCoords, true);
            window.removeEventListener('resize', updateCoords);
        };
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const isInsideContainer = containerRef.current?.contains(e.target as Node);
            const isInsideList = listRef.current?.contains(e.target as Node);

            if (!isInsideContainer && !isInsideList) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleGroup = (group: string) => {
        setUserExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group);
            else next.add(group);
            return next;
        });
    };

    const handleSelect = (val: string) => {
        onChange(val);
        setIsOpen(false);
        setSearch("");
    };

    const portalDropdown = isOpen && mounted && createPortal(
        <div
            ref={listRef}
            className="fixed z-[9999] pointer-events-none"
            style={{
                top: coords.top,
                left: coords.left,
                width: coords.width,
                transform: coords.direction === 'up' ? 'translateY(-100%) translateY(-8px)' : 'translateY(8px)'
            }}
        >
            <div className="pointer-events-auto w-full bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-3 border-b dark:border-white/10">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            autoFocus
                            type="text"
                            className="w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-[#0f1523] border border-slate-100 dark:border-white/10 rounded-xl outline-none text-sm dark:text-white focus:ring-1 focus:ring-[#DAA520] transition-all"
                            placeholder={searchPlaceholder}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {search && (
                            <button
                                onClick={() => setSearch("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="max-h-[220px] overflow-y-auto p-1 custom-scrollbar">
                    {Object.keys(groupedOptions).length === 0 || (Object.values(groupedOptions).every(arr => arr.length === 0)) ? (
                        <div className="px-3 py-6 text-center">
                            <Search className="mx-auto mb-2 text-slate-300" size={24} />
                            <p className="text-sm text-slate-400">No se encontraron resultados</p>
                        </div>
                    ) : (
                        Object.entries(groupedOptions).map(([group, opts]) => {
                            const isExpanded = !grouped || effectiveExpandedGroups.has(group);
                            return (
                                <div key={group || "main"} className="mb-1">
                                    {group && opts.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => toggleGroup(group)}
                                            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50 dark:bg-white/5/20 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors mb-1"
                                        >
                                            <span>{group}</span>
                                            <ChevronDown size={12} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                        </button>
                                    )}
                                    {isExpanded && opts.map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => handleSelect(opt.value)}
                                            className={`
                                                w-full flex items-center justify-between px-3 py-2.5 
                                                rounded-xl text-sm transition-all text-left mb-0.5
                                                ${value === opt.value
                                                    ? 'bg-[#DAA520]/10 text-[#DAA520] font-bold'
                                                    : 'hover:bg-slate-100 dark:hover:bg-white/5 dark:text-slate-300'}
                                            `}
                                        >
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                {opt.icon && (
                                                    <div className="relative w-5 h-3.5 shrink-0">
                                                        <Image
                                                            src={opt.icon}
                                                            alt=""
                                                            fill
                                                            className="object-cover rounded-sm border border-slate-200 dark:border-white/10"
                                                        />
                                                    </div>
                                                )}
                                                <span className="wrap-break-word">{opt.label}</span>
                                            </div>
                                            {value === opt.value && <Check size={16} className="shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>,
        document.body
    );

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => !disabled && !loading && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`
                    w-full flex items-center justify-between px-4 py-3.5 
                    bg-slate-50 dark:bg-[#0f1523] 
                    border border-slate-100 dark:border-white/10 
                    rounded-2xl text-sm font-bold dark:text-white transition-all
                    ${isOpen ? 'ring-2 ring-[#DAA520] border-transparent' : 'hover:border-slate-200 dark:hover:border-gray-700'}
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
            >
                <div className="flex items-center gap-2 wrap-break-word">
                    {selectedOption?.icon && (
                        <div className="relative w-5 h-3.5 shrink-0">
                            <Image
                                src={selectedOption.icon}
                                alt=""
                                fill
                                className="object-cover rounded-sm border border-slate-200 dark:border-white/10"
                            />
                        </div>
                    )}
                    <span className={!selectedOption ? 'text-slate-400 font-normal' : ''}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                </div>
                {loading ? (
                    <div className="w-4 h-4 border-2 border-[#DAA520] border-t-transparent rounded-full animate-spin" />
                ) : (
                    <ChevronDown size={18} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                )}
            </button>
            {portalDropdown}
        </div>
    );
}
