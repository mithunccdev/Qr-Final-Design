import React, { useMemo } from 'react';
import { Edit2, Trash2 } from 'lucide-react';

export interface Column<T> {
    header: string;
    accessorKey: keyof T;
    render?: (value: any, item: T) => React.ReactNode;
}

interface TableProps<T> {
    data: T[];
    columns: Column<T>[];
    keyField: keyof T;
    onEdit?: (item: T) => void;
    onDelete?: (item: T) => void;
    // Selection Props
    selectedIds?: string[];
    onSelectionChange?: (selectedIds: string[]) => void;
}

export function Table<T>({
    data,
    columns,
    onEdit,
    onDelete,
    keyField,
    selectedIds,
    onSelectionChange
}: TableProps<T>) {

    const isSelectionEnabled = !!onSelectionChange;
    const allIds = useMemo(() => data.map(d => String(d[keyField])), [data, keyField]);
    const isAllSelected = isSelectionEnabled && selectedIds?.length === data.length && data.length > 0;
    const isIndeterminate = isSelectionEnabled && (selectedIds?.length || 0) > 0 && (selectedIds?.length || 0) < data.length;

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!onSelectionChange) return;
        if (e.target.checked) {
            onSelectionChange(allIds);
        } else {
            onSelectionChange([]);
        }
    };

    const handleSelectRow = (id: string, checked: boolean) => {
        if (!onSelectionChange || !selectedIds) return;
        if (checked) {
            onSelectionChange([...selectedIds, id]);
        } else {
            onSelectionChange(selectedIds.filter(selectedId => selectedId !== id));
        }
    };

    if (data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 bg-slate-900/60 rounded-2xl border border-dashed border-slate-800 text-slate-400">
                <p className="text-sm">No records found in current collection</p>
            </div>
        );
    }

    return (
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800/80 overflow-hidden shadow-xl">
            {/* Table View - Hidden on mobile, shown on md+ */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950/80 text-slate-400 text-[11px] uppercase font-bold tracking-wider border-b border-slate-800">
                        <tr>
                            {isSelectionEnabled && (
                                <th className="px-5 py-3.5 w-10">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
                                        checked={isAllSelected}
                                        ref={input => {
                                            if (input) input.indeterminate = !!isIndeterminate;
                                        }}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                            )}
                            {columns.map((col, idx) => (
                                <th key={idx} className="px-5 py-3.5 font-bold">
                                    {col.header}
                                </th>
                            ))}
                            {(onEdit || onDelete) && (
                                <th className="px-5 py-3.5 font-bold text-right">
                                    Actions
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                        {data.map((item) => {
                            const id = String(item[keyField]);
                            const isSelected = selectedIds?.includes(id);

                            return (
                                <tr key={id} className={`hover:bg-slate-800/40 transition-colors ${isSelected ? 'bg-indigo-950/30' : ''}`}>
                                    {isSelectionEnabled && (
                                        <td className="px-5 py-3.5">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
                                                checked={isSelected}
                                                onChange={(e) => handleSelectRow(id, e.target.checked)}
                                            />
                                        </td>
                                    )}
                                    {columns.map((col, idx) => (
                                        <td key={idx} className="px-5 py-3.5 text-xs text-slate-200 font-medium">
                                            {col.render ? col.render(item[col.accessorKey], item) : String(item[col.accessorKey])}
                                        </td>
                                    ))}
                                    {(onEdit || onDelete) && (
                                        <td className="px-5 py-3.5 text-right space-x-1.5">
                                            {onEdit && (
                                                <button
                                                    onClick={() => onEdit(item)}
                                                    className="text-slate-400 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                                                    title="Edit Record"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                            )}
                                            {onDelete && (
                                                <button
                                                    onClick={() => onDelete(item)}
                                                    className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-950/40 transition-colors cursor-pointer"
                                                    title="Delete Record"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-800/60">
                {data.map((item) => {
                    const id = String(item[keyField]);
                    const isSelected = selectedIds?.includes(id);

                    return (
                        <div key={id} className={`p-4 ${isSelected ? 'bg-indigo-950/30' : ''}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-3">
                                    {isSelectionEnabled && (
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
                                            checked={isSelected}
                                            onChange={(e) => handleSelectRow(id, e.target.checked)}
                                        />
                                    )}
                                    <div className="flex flex-col gap-1">
                                        {columns.map((col, idx) => (
                                            <div key={idx} className={idx === 0 ? "font-bold text-white text-sm" : "text-xs text-slate-300"}>
                                                {idx > 0 && <span className="text-slate-500 mr-1">{col.header}:</span>}
                                                {col.render ? col.render(item[col.accessorKey], item) : String(item[col.accessorKey])}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    {onEdit && (
                                        <button
                                            onClick={() => onEdit(item)}
                                            className="text-indigo-400 p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                    )}
                                    {onDelete && (
                                        <button
                                            onClick={() => onDelete(item)}
                                            className="text-rose-400 p-1.5 rounded-lg hover:bg-rose-950/40 cursor-pointer"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
