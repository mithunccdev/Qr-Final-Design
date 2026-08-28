import React, { useState, useEffect } from 'react';
import type { StickerLayout } from 'react-qr-label';
import { Plus, Layout, User, Cpu, Trash2, Edit3, Sparkles, Layers } from 'lucide-react';
import { EntityMaster } from '../sandbox/EntityMaster';

interface LabelListProps {
    labels: StickerLayout[];
    onCreateNew: () => void;
    onEdit: (label: StickerLayout) => void;
    onDelete: (id: string) => void;
}

export const LabelList: React.FC<LabelListProps> = ({
    labels,
    onCreateNew,
    onEdit,
    onDelete
}) => {
    const [selectedLabelId, setSelectedLabelId] = useState<string>('');

    // Set initial selection
    useEffect(() => {
        if (labels.length > 0 && !selectedLabelId) {
            setSelectedLabelId(labels[0].id);
        }
    }, [labels, selectedLabelId]);

    const activeLabel = labels.find(l => l.id === selectedLabelId) || labels[0];

    const handleDelete = (label: StickerLayout, e: React.MouseEvent) => {
        e.stopPropagation(); // prevent selecting the deleted label card
        if (confirm(`Are you sure you want to delete "${label.name}"?`)) {
            onDelete(label.id);
            if (selectedLabelId === label.id) {
                setSelectedLabelId('');
            }
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500 font-sans">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-slate-800/80">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-indigo-950/80 text-indigo-400 border border-indigo-700/40">
                            <Layers size={18} />
                        </span>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Label Studio & Workspace</h1>
                    </div>
                    <p className="text-slate-400 text-sm mt-1">Select a template, customize on the visual canvas, or execute live batch mail-merge prints.</p>
                </div>
                <button
                    onClick={onCreateNew}
                    className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white px-5 py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 active:scale-95 cursor-pointer text-xs sm:text-sm"
                >
                    <Plus size={16} />
                    <span>Create Custom Layout</span>
                </button>
            </div>

            {labels.length === 0 ? (
                <div className="bg-slate-900/60 rounded-3xl border border-slate-800 shadow-2xl p-16 text-center max-w-2xl mx-auto space-y-6">
                    <div className="w-16 h-16 bg-indigo-950/80 text-indigo-400 border border-indigo-700/50 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                        <Layout size={32} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">No Layout Templates Available</h3>
                        <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto leading-relaxed">
                            Create a custom canvas or return to the overview page to load pre-configured industrial workflows.
                        </p>
                    </div>
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={onCreateNew}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg transition-all cursor-pointer text-xs sm:text-sm"
                        >
                            Create Layout
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                    
                    {/* Left Column: Template List (4 Cols) */}
                    <div className="xl:col-span-4 space-y-4">
                        <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800/80 flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                Saved Templates
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-950 text-cyan-300 border border-slate-800 font-mono">
                                {labels.length}
                            </span>
                        </div>

                        <div className="space-y-3 max-h-[650px] overflow-y-auto pr-1">
                            {labels.map(label => {
                                const isSelected = label.id === selectedLabelId;
                                const isEmployee = label.targetEntity === 'employee';

                                return (
                                    <div
                                        key={label.id}
                                        onClick={() => setSelectedLabelId(label.id)}
                                        className={`group relative p-5 rounded-2xl border transition-all duration-200 cursor-pointer text-left ${
                                            isSelected
                                                ? 'bg-slate-900/95 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500/40'
                                                : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/70'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex gap-3.5">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                                                    isSelected 
                                                        ? 'bg-indigo-950/80 border-indigo-500/50 text-cyan-400 shadow-inner' 
                                                        : 'bg-slate-950 border-slate-800 text-slate-400'
                                                }`}>
                                                    <Layout size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-white text-sm leading-tight pr-4">
                                                        {label.name}
                                                    </h4>
                                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                                            isEmployee
                                                                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                                                                : 'bg-violet-950/60 text-violet-300 border border-violet-800/40'
                                                        }`}>
                                                            {isEmployee ? <User size={10} /> : <Cpu size={10} />}
                                                            {label.targetEntity || 'None'}
                                                        </span>
                                                        <span className="text-slate-400 text-[10px] font-semibold font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                                            {label.width}{label.unit} × {label.height}{label.unit}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions row */}
                                        <div className={`flex items-center gap-2 mt-4 pt-3 border-t border-slate-800/60 transition-all ${
                                            isSelected ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'
                                        }`}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onEdit(label);
                                                }}
                                                className="flex items-center justify-center gap-1.5 bg-slate-950 hover:bg-indigo-600 text-slate-300 hover:text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-all border border-slate-800 hover:border-transparent cursor-pointer active:scale-95"
                                            >
                                                <Edit3 size={12} className="text-indigo-400 group-hover:text-white" />
                                                <span>Edit Canvas</span>
                                            </button>
                                            <button
                                                onClick={(e) => handleDelete(label, e)}
                                                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-900/50 ml-auto"
                                                title="Delete Template"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Column: Database Grid & Dev Integration (8 Cols) */}
                    <div className="xl:col-span-8">
                        {activeLabel ? (
                            <EntityMaster layout={activeLabel} />
                        ) : (
                            <div className="bg-slate-900/60 rounded-3xl border border-slate-800 shadow-xl p-16 text-center">
                                <Sparkles className="text-indigo-400 mx-auto mb-4" size={26} />
                                <h3 className="font-bold text-white">Select a layout template</h3>
                                <p className="text-sm text-slate-400 mt-2">
                                    Choose a template from the left sidebar to preview merge data and trigger batch prints.
                                </p>
                            </div>
                        )}
                    </div>

                </div>
            )}
        </div>
    );
};
