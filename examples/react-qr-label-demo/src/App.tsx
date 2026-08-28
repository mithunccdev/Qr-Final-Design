// App.tsx
import { useEffect, useState } from 'react';
import { QRLabelDesigner, type EntitySchema, type StickerLayout } from 'react-qr-label';
import 'react-qr-label/style.css';
import './App.css';
import { LabelList } from './features/labels/LabelList';
import { storage } from './services/storage';
import {
  LayoutDashboard,
  Layers,
  Plus,
  Trash2,
  QrCode,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Users,
  Cpu,
  ShieldCheck,
  ArrowLeft
} from 'lucide-react';
import { LandingPage } from './features/home/LandingPage';

// Sample Schema (mapped to designer variables)
const SAMPLE_SCHEMAS: Record<string, EntitySchema> = {
  employee: {
    label: "Employee Master",
    fields: [
      { name: "fullName", label: "Full Name" },
      { name: "employeeId", label: "Employee ID" },
      { name: "department", label: "Department" },
      { name: "joinDate", label: "Join Date" },
    ],
    sampleData: {
      fullName: "Arjun Mehta",
      employeeId: "EMP-001",
      department: "Operations",
      joinDate: "2024-01-10"
    }
  },
  machine: {
    label: "Machine Master",
    fields: [
      { name: "machineName", label: "Machine Name" },
      { name: "machineCode", label: "Machine Code" },
      { name: "location", label: "Location" },
      { name: "model", label: "Model" },
    ],
    sampleData: {
      machineName: "CNC Router X1",
      machineCode: "CNC-01",
      location: "Section A",
      model: "2025-Pro"
    }
  }
};

// Initial Default Layout for New Labels
const DEFAULT_NEW_LAYOUT: Omit<StickerLayout, 'id'> = {
  name: "New QR Label",
  targetEntity: "employee",
  width: 100,
  height: 60,
  unit: "mm",
  backgroundColor: "#ffffff",
  elements: []
};

type NavSection = 'dashboard' | 'studio';

function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [isDesignerOpen, setIsDesignerOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [labels, setLabels] = useState<StickerLayout[]>([]);
  const [editingLayout, setEditingLayout] = useState<StickerLayout | null>(null);

  // Load data on mount
  useEffect(() => {
    storage.initializeDefaults();
    setLabels(storage.getLabels());
  }, []);

  const handleCreateNew = () => {
    setEditingLayout({ ...DEFAULT_NEW_LAYOUT, id: crypto.randomUUID() } as StickerLayout);
    setIsDesignerOpen(true);
  };

  const handleEdit = (layout: StickerLayout) => {
    setEditingLayout(layout);
    setIsDesignerOpen(true);
  };

  const handleDelete = (id: string) => {
    storage.deleteLabel(id);
    setLabels(storage.getLabels());
  };

  const handleCloseDesigner = () => {
    setIsDesignerOpen(false);
    setEditingLayout(null);
  };

  const handleLoadPreset = (presetId: string) => {
    storage.initializeDefaults();
    const defaultLabels = storage.getLabels();
    const preset = defaultLabels.find(l => l.id === presetId);
    if (preset) {
      setEditingLayout(preset);
      setIsDesignerOpen(true);
    }
  };

  const navigateTo = (section: NavSection) => {
    setActiveSection(section);
    setIsDesignerOpen(false);
    setIsMobileMenuOpen(false);
  };

  // ── 1. FULL SCREEN CANVAS DESIGNER VIEW (No side menu) ──
  if (isDesignerOpen) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 w-screen h-screen overflow-hidden flex flex-col font-sans">
        {/* Top Minimal Canvas Header with Back Action */}
        <div className="h-12 bg-slate-950 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-50 shadow-md">
          <div className="flex items-center gap-3">
            <button
              onClick={handleCloseDesigner}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white px-3 py-1.5 rounded-xl font-semibold shadow-sm transition-all border border-slate-700/80 cursor-pointer text-xs active:scale-95"
            >
              <ArrowLeft size={14} className="text-indigo-400" />
              <span>Back to Studio</span>
            </button>
            <div className="h-4 w-px bg-slate-800 hidden sm:block"></div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white truncate max-w-[180px] sm:max-w-xs">
                {editingLayout?.name || 'New Layout'}
              </span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/70 border border-cyan-800/50 px-2 py-0.5 rounded-full">
                {editingLayout?.width}{editingLayout?.unit} × {editingLayout?.height}{editingLayout?.unit}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 bg-slate-900/60 px-2.5 py-1 rounded-lg border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="hidden md:inline font-medium text-slate-300">Canvas Mode Active</span>
            </div>
          </div>
        </div>

        {/* Full-bleed Editor Area */}
        <div className="flex-1 relative w-full h-[calc(100vh-48px)] overflow-hidden">
          <QRLabelDesigner
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            className="designer-container"
            entitySchemas={SAMPLE_SCHEMAS}
            initialLayout={editingLayout || ({ ...DEFAULT_NEW_LAYOUT, id: 'temp-new-layout' } as StickerLayout)}
            onSave={(layout: StickerLayout) => {
              storage.addLabel(layout);
              setLabels(storage.getLabels());
              handleCloseDesigner();
            }}
          />
        </div>
      </div>
    );
  }

  // ── 2. APP DASHBOARD & STUDIO VIEW (With Left Side Navigation Menu) ──
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans overflow-x-hidden">
      
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 lg:hidden"
        />
      )}

      {/* Left App Sidebar */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-40 flex flex-col bg-slate-950 border-r border-slate-800/90 shadow-2xl transition-all duration-300 ${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        } ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Sidebar Brand Header */}
        <div className="h-16 border-b border-slate-800/80 px-4 flex items-center justify-between shrink-0">
          <div 
            onClick={() => navigateTo('dashboard')}
            className="flex items-center gap-3 cursor-pointer overflow-hidden group"
          >
            <div className="relative p-2.5 bg-gradient-to-tr from-indigo-600 via-violet-600 to-cyan-400 rounded-xl shadow-lg shadow-indigo-600/30 group-hover:scale-105 transition-transform shrink-0">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            {!isSidebarCollapsed && (
              <div className="min-w-0 transition-opacity duration-200">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold tracking-tight text-white truncate">
                    QR Studio
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-indigo-950 text-indigo-300 border border-indigo-700/50 px-1.5 py-0.2 rounded-full">
                    v2.0
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate">
                  by <span className="text-cyan-400 font-semibold">Mithun Dev</span>
                </p>
              </div>
            )}
          </div>

          {/* Desktop Collapse Button */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors cursor-pointer"
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sidebar Quick Action */}
        <div className="p-3 border-b border-slate-800/60">
          <button
            onClick={handleCreateNew}
            className={`w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/25 transition-all cursor-pointer active:scale-95 ${
              isSidebarCollapsed ? 'p-2.5' : 'py-2.5 px-4 text-xs'
            }`}
            title="Create New Label Canvas"
          >
            <Plus size={16} className="shrink-0" />
            {!isSidebarCollapsed && <span>New Canvas</span>}
          </button>
        </div>

        {/* Navigation Menu Links */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 scrollbar-thin">
          
          {/* Main Navigation */}
          <div>
            {!isSidebarCollapsed && (
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
                Main App
              </p>
            )}
            <nav className="space-y-1">
              <button
                onClick={() => navigateTo('dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeSection === 'dashboard'
                    ? 'bg-gradient-to-r from-indigo-950 to-slate-900 text-cyan-300 border border-indigo-500/40 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-900/80 hover:text-slate-200'
                }`}
                title="Overview & Metrics"
              >
                <LayoutDashboard size={17} className={activeSection === 'dashboard' ? 'text-cyan-400' : 'text-slate-400'} />
                {!isSidebarCollapsed && <span>Dashboard</span>}
              </button>

              <button
                onClick={() => navigateTo('studio')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeSection === 'studio'
                    ? 'bg-gradient-to-r from-indigo-950 to-slate-900 text-cyan-300 border border-indigo-500/40 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-900/80 hover:text-slate-200'
                }`}
                title="Label Studio & Batch Workspace"
              >
                <div className="flex items-center gap-3">
                  <Layers size={17} className={activeSection === 'studio' ? 'text-cyan-400' : 'text-slate-400'} />
                  {!isSidebarCollapsed && <span>Label Studio</span>}
                </div>
                {!isSidebarCollapsed && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-slate-900 text-slate-400 border border-slate-800">
                    {labels.length}
                  </span>
                )}
              </button>
            </nav>
          </div>

          {/* Quick Preset Workflows */}
          <div>
            {!isSidebarCollapsed && (
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
                Quick Presets
              </p>
            )}
            <div className="space-y-1">
              <button
                onClick={() => handleLoadPreset('default-emp-layout')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors cursor-pointer text-left"
                title="Staff ID Badge Preset"
              >
                <Users size={15} className="text-emerald-400 shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">Staff ID Badges</span>}
              </button>
              <button
                onClick={() => handleLoadPreset('default-machine-layout')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors cursor-pointer text-left"
                title="Machine Spec Plate Preset"
              >
                <Cpu size={15} className="text-violet-400 shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">Equipment Plates</span>}
              </button>
            </div>
          </div>

          {/* System Engine Status */}
          {!isSidebarCollapsed && (
            <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/70 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Print Engine</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Active
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Privacy Sandbox</span>
                <span className="text-cyan-400 font-semibold">Client 100%</span>
              </div>
            </div>
          )}

        </div>

        {/* Sidebar Footer / User & Reset */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/90 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-black text-white text-xs shrink-0 shadow-md">
                M
              </div>
              {!isSidebarCollapsed && (
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">Mithun Dev</p>
                  <p className="text-[10px] text-slate-400 truncate">App Workspace</p>
                </div>
              )}
            </div>
            
            <button
              onClick={() => {
                if (confirm('Reset demo database and custom templates to factory default?')) {
                  storage.clearAll();
                  setLabels([]);
                  window.location.reload();
                }
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/40 transition-colors cursor-pointer shrink-0"
              title="Reset Demo Data"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        
        {/* App Top Bar */}
        <header className="h-16 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between shrink-0 sticky top-0 z-30 shadow-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            >
              <Menu size={18} />
            </button>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="text-slate-400 font-medium">QR Studio</span>
              <span className="text-slate-600">/</span>
              <span className="text-white font-bold capitalize">
                {activeSection === 'dashboard' ? 'Overview' : 'Label Studio'}
              </span>
            </div>
          </div>

          {/* Right Header Status Pills & Action */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
              <ShieldCheck size={14} className="text-cyan-400" />
              <span>ZPL / PDF Ready</span>
            </div>

            <button
              onClick={handleCreateNew}
              className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs shadow-md transition-all cursor-pointer active:scale-95"
            >
              <Plus size={14} />
              <span>New Canvas</span>
            </button>
          </div>
        </header>

        {/* Main Content View */}
        <main className="flex-1 overflow-y-auto">
          {activeSection === 'dashboard' ? (
            <LandingPage onNavigate={(view) => navigateTo(view === 'home' ? 'dashboard' : 'studio')} onLoadPreset={handleLoadPreset} />
          ) : (
            <LabelList
              labels={labels}
              onCreateNew={handleCreateNew}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </main>

      </div>

    </div>
  );
}

export default App;
