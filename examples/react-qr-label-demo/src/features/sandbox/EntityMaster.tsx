import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Printer, FileText, Image as ImageIcon, Info, Code, Copy, Check, Terminal, Eye, Database } from 'lucide-react';
import { storage } from '../../services/storage';
import { Table, type Column } from '../../components/Table';
import { StickerPrinter } from 'react-qr-label';
import { exportToPNG, exportToBatchPDF, exportToZPLFile } from '../../services/exportUtils';
import type { StickerLayout } from 'react-qr-label';

interface EntityMasterProps {
    layout: StickerLayout;
}

interface EntityMeta {
    label: string;
    columns: Column<any>[];
    getItems: () => any[];
    addItem: (item: any) => void;
    deleteItem: (id: string) => void;
    defaultFormValues: Record<string, string>;
    fields: { name: string; label: string; placeholder?: string; type?: string }[];
}

const ENTITY_METADATA: Record<string, EntityMeta> = {
    employee: {
        label: 'Employee',
        columns: [
            { header: 'Employee ID', accessorKey: 'employeeId' },
            { header: 'Full Name', accessorKey: 'fullName' },
            { header: 'Department', accessorKey: 'department' },
            { header: 'Join Date', accessorKey: 'joinDate' },
        ],
        getItems: () => storage.getEmployees(),
        addItem: (item) => storage.addEmployee(item),
        deleteItem: (id) => storage.deleteEmployee(id),
        defaultFormValues: { fullName: '', employeeId: '', department: '', joinDate: new Date().toISOString().split('T')[0] },
        fields: [
            { name: 'fullName', label: 'Full Name', placeholder: 'e.g. Arjun Mehta', type: 'text' },
            { name: 'employeeId', label: 'Employee ID', placeholder: 'e.g. EMP-001', type: 'text' },
            { name: 'department', label: 'Department', placeholder: 'e.g. Engineering', type: 'text' },
            { name: 'joinDate', label: 'Join Date', type: 'date' },
        ]
    },
    machine: {
        label: 'Machine',
        columns: [
            { header: 'Machine Code', accessorKey: 'machineCode' },
            { header: 'Machine Name', accessorKey: 'machineName' },
            { header: 'Location', accessorKey: 'location' },
            { header: 'Model', accessorKey: 'model' },
        ],
        getItems: () => storage.getMachines(),
        addItem: (item) => storage.addMachine(item),
        deleteItem: (id) => storage.deleteMachine(id),
        defaultFormValues: { machineName: '', machineCode: '', location: '', model: '' },
        fields: [
            { name: 'machineName', label: 'Machine Name', placeholder: 'e.g. CNC Router X1', type: 'text' },
            { name: 'machineCode', label: 'Machine Code', placeholder: 'e.g. CNC-01', type: 'text' },
            { name: 'location', label: 'Location', placeholder: 'e.g. Section A', type: 'text' },
            { name: 'model', label: 'Model', placeholder: 'e.g. 2025-Pro', type: 'text' },
        ]
    }
};

export const EntityMaster: React.FC<EntityMasterProps> = ({ layout }) => {
    const targetEntity = layout.targetEntity || 'employee';
    const meta = ENTITY_METADATA[targetEntity] || ENTITY_METADATA.employee;

    const [items, setItems] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>({});
    
    // Developer panel state
    const [showDevPanel, setShowDevPanel] = useState(false);
    const [codeTab, setCodeTab] = useState<'react' | 'headless' | 'json'>('react');
    const [copied, setCopied] = useState(false);

    const printer = useRef(new StickerPrinter());

    useEffect(() => {
        loadData();
        setSelectedIds([]); // reset selection on layout/entity change
    }, [layout, targetEntity]);

    const loadData = () => {
        setItems(meta.getItems());
    };

    const handleOpenModal = (item?: any) => {
        if (item) {
            setEditingItem(item);
            setFormData(item);
        } else {
            setEditingItem(null);
            setFormData(meta.defaultFormValues);
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingItem(null);
        setFormData({});
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        
        const hasRequired = meta.fields.every(f => !f.placeholder || formData[f.name]);
        if (!hasRequired) return;

        const newItem = {
            id: editingItem?.id || crypto.randomUUID(),
            ...formData
        };

        meta.addItem(newItem);
        loadData();
        handleCloseModal();
    };

    const handleDelete = (item: any) => {
        const identifier = item.fullName || item.machineName || 'this item';
        if (window.confirm(`Are you sure you want to delete ${identifier}?`)) {
            meta.deleteItem(item.id);
            loadData();
            setSelectedIds(prev => prev.filter(id => id !== item.id));
        }
    };

    const getSelectedItems = () => {
        return items.filter(item => selectedIds.includes(item.id));
    };

    const handleExportPNG = async () => {
        const selected = getSelectedItems();
        if (selected.length === 0) return;

        await exportToPNG({
            layout,
            items: selected,
            printer: printer.current,
            baseFilename: `${targetEntity}-label`
        });
    };

    const handleExportPDF = async () => {
        const selected = getSelectedItems();
        if (selected.length === 0) return;

        await exportToBatchPDF({
            layout,
            items: selected,
            printer: printer.current,
            baseFilename: `batch-${targetEntity}-labels`
        });
    };

    const handleExportZPL = () => {
        const selected = getSelectedItems();
        if (selected.length === 0) return;

        exportToZPLFile({
            layout,
            items: selected,
            printer: printer.current,
            baseFilename: `batch-${targetEntity}-labels`
        });
    };

    // --- Dynamic Code Generators ---
    const getReactCode = () => `import { useState } from 'react';
import { QRLabelDesigner, type StickerLayout } from 'react-qr-label';
import 'react-qr-label/style.css';

// Visual design template JSON
const INITIAL_LAYOUT: StickerLayout = ${JSON.stringify(layout, null, 2)};

const SCHEMAS = {
  ${targetEntity}: {
    label: '${meta.label} Master',
    fields: [
${meta.fields.map(f => `      { name: '${f.name}', label: '${f.label}' }`).join(',\n')}
    ],
    sampleData: {
${meta.fields.map(f => `      ${f.name}: '${f.placeholder ? f.placeholder.replace('e.g. ', '') : 'Value'}'`).join(',\n')}
    }
  }
};

export default function MyLabelDesigner() {
  const [layout, setLayout] = useState<StickerLayout>(INITIAL_LAYOUT);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <QRLabelDesigner
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        initialLayout={layout}
        entitySchemas={SCHEMAS}
        onSave={(savedLayout) => {
          setLayout(savedLayout);
        }}
      />
    </div>
  );
}`;

    const getHeadlessCode = () => `import { StickerPrinter } from 'react-qr-label';
import { exportToPDF } from 'react-qr-label/pdf';

const printer = new StickerPrinter();
const layout = ${JSON.stringify(layout, null, 2)};

// Your datasets to inject into variables like {{variableName}}
const dataset = [
  {
    id: '1',
${meta.fields.map(f => `    ${f.name}: '${f.placeholder ? f.placeholder.replace('e.g. ', '') : 'Value'}'`).join(',\n')}
  }
];

// ─── Render to PNG (works in browser) ────────────────────────
const dataUrl = await printer.renderToDataURL(layout, dataset[0], { format: 'png' });

// ─── Export Batch PDF (requires jspdf) ───────────────────────
const pdf = await exportToPDF(layout, dataset);
pdf.save('labels.pdf');

// ─── Export ZPL (send to Zebra/thermal socket) ───────────────
const zplArray = printer.exportToZPL(layout, dataset);
console.log(zplArray.join('\\n'));
`;

    const getActiveCode = () => {
        if (codeTab === 'react') return getReactCode();
        if (codeTab === 'headless') return getHeadlessCode();
        return JSON.stringify(layout, null, 2);
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(getActiveCode());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const hasSelection = selectedIds.length > 0;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left/Main Content: Database grid & Batch Print */}
            <div className={`${showDevPanel ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-6 transition-all duration-300 w-full`}>
                
                {/* Header card */}
                <div className="bg-slate-900/80 p-6 rounded-3xl border border-slate-800/80 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <span className="inline-flex items-center gap-1.5 bg-indigo-950/80 text-cyan-300 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-2 border border-indigo-800/50">
                            <Database size={11} />
                            Active Schema: {meta.label}
                        </span>
                        <h3 className="text-xl font-bold text-white">Dynamic Record Sandbox</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Select records to test mail-merge variables and batch export</p>
                    </div>
                    
                    <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap w-full sm:w-auto">
                        <button
                            onClick={() => setShowDevPanel(!showDevPanel)}
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all border text-xs sm:text-sm cursor-pointer ${
                                showDevPanel
                                    ? 'bg-indigo-950/80 border-indigo-500/50 text-cyan-300'
                                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-850'
                            }`}
                        >
                            <Code size={15} />
                            <span>{showDevPanel ? 'Hide Integration' : 'Show Integration'}</span>
                        </button>

                        <button
                            onClick={() => handleOpenModal()}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white px-4 py-2.5 rounded-xl font-semibold transition-all shadow-md cursor-pointer text-xs sm:text-sm shrink-0 active:scale-95"
                        >
                            <Plus size={15} />
                            Add {meta.label}
                        </button>
                    </div>
                </div>

                {/* Batch Action Bar */}
                {hasSelection ? (
                    <div className="bg-gradient-to-r from-indigo-950/80 to-slate-900/90 border border-indigo-500/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 animate-in slide-in-from-top-2 shadow-lg shadow-indigo-950/40">
                        <div className="flex items-center gap-2 text-slate-200">
                            <span className="font-bold bg-indigo-600 text-white px-2.5 py-1 rounded-lg text-xs font-mono">
                                {selectedIds.length} Selected
                            </span>
                            <span className="text-xs text-slate-300">Ready for batch generation:</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleExportPNG}
                                className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95"
                                title="Download PNG Images"
                            >
                                <ImageIcon size={13} />
                                PNG
                            </button>
                            <button
                                onClick={handleExportPDF}
                                className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-rose-300 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95"
                                title="Download PDF"
                            >
                                <FileText size={13} />
                                PDF
                            </button>
                            <button
                                onClick={handleExportZPL}
                                className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95"
                                title="Download ZPL file"
                            >
                                <Printer size={13} />
                                ZPL
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4 flex items-start gap-3">
                        <Info className="text-indigo-400 shrink-0 mt-0.5" size={16} />
                        <p className="text-xs text-slate-400 leading-relaxed">
                            <strong className="text-slate-200">Batch mail-merge print:</strong> Select one or more rows below to activate direct PNG, PDF, or ZPL batch generation.
                        </p>
                    </div>
                )}

                {/* Table card */}
                <div className="bg-slate-900/80 rounded-3xl border border-slate-800/80 shadow-xl overflow-hidden">
                    <Table
                        data={items}
                        columns={meta.columns}
                        keyField="id"
                        onEdit={handleOpenModal}
                        onDelete={handleDelete}
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                    />
                </div>
            </div>

            {/* Right Side: Developer Integration & Live Code Snippets */}
            {showDevPanel && (
                <div className="lg:col-span-5 space-y-6 animate-in slide-in-from-right-5 duration-300 w-full">
                    
                    {/* Integration card */}
                    <div className="bg-slate-900/90 rounded-3xl border border-slate-800/80 shadow-xl overflow-hidden flex flex-col h-[600px]">
                        <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Code className="text-cyan-400" size={18} />
                                <h3 className="font-bold text-white text-sm">Integration Studio</h3>
                            </div>
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800 px-3 py-1.5 rounded-xl transition-all font-medium cursor-pointer"
                            >
                                {copied ? (
                                    <>
                                        <Check size={13} className="text-emerald-400" />
                                        <span>Copied!</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy size={13} />
                                        <span>Copy Code</span>
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Tab Navigation */}
                        <div className="flex bg-slate-950/90 border-b border-slate-800 p-1.5 gap-1">
                            <button
                                onClick={() => setCodeTab('react')}
                                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                    codeTab === 'react' ? 'bg-indigo-950 text-cyan-300 border border-indigo-500/40 shadow-inner' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                <Eye size={12} />
                                React Embed
                            </button>
                            <button
                                onClick={() => setCodeTab('headless')}
                                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                    codeTab === 'headless' ? 'bg-indigo-950 text-cyan-300 border border-indigo-500/40 shadow-inner' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                <Terminal size={12} />
                                Headless
                            </button>
                            <button
                                onClick={() => setCodeTab('json')}
                                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                    codeTab === 'json' ? 'bg-indigo-950 text-cyan-300 border border-indigo-500/40 shadow-inner' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                <Code size={12} />
                                Schema
                            </button>
                        </div>

                        {/* Live Editor Snippet */}
                        <div className="flex-1 bg-slate-950 p-4 font-mono text-xs overflow-y-auto text-slate-300 select-all">
                            <pre className="whitespace-pre">{getActiveCode()}</pre>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Overlay */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
                    <div className="bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all border border-slate-800">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
                            <h3 className="text-base font-bold text-white">
                                {editingItem ? `Edit ${meta.label}` : `Add New ${meta.label}`}
                            </h3>
                            <button
                                onClick={handleCloseModal}
                                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            {meta.fields.map(f => (
                                <div key={f.name} className="space-y-1.5">
                                    <label className="block text-xs font-semibold text-slate-300">{f.label}</label>
                                    <input
                                        type={f.type || 'text'}
                                        required={!!f.placeholder}
                                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-xs text-white shadow-inner"
                                        value={formData[f.name] || ''}
                                        onChange={e => setFormData({ ...formData, [f.name]: e.target.value })}
                                        placeholder={f.placeholder || ''}
                                    />
                                </div>
                            ))}

                            {/* Modal Footer */}
                            <div className="flex gap-3 pt-4 border-t border-slate-800 mt-6">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="flex-1 px-4 py-2.5 border border-slate-800 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 font-semibold transition-colors text-xs cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white rounded-xl hover:from-indigo-600 hover:to-violet-700 font-bold shadow-md transition-all text-xs cursor-pointer"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
