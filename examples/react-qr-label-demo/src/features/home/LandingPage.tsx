import {
  ArrowRight,
  Cpu,
  Users,
  Shield,
  Zap,
  Layout,
  CheckCircle2,
  Sparkles,
  Printer,
  FileCode,
  Layers,
  Flame,
} from "lucide-react";

interface LandingPageProps {
  onNavigate: (view: "home" | "labels") => void;
  onLoadPreset?: (presetId: string) => void;
}

export function LandingPage({ onNavigate, onLoadPreset }: LandingPageProps) {
  const handleLoadWorkflow = (presetId: string) => {
    if (onLoadPreset) {
      onLoadPreset(presetId);
    } else {
      onNavigate("labels");
    }
  };

  return (
    <div className="bg-slate-950 text-slate-100 min-h-screen font-sans selection:bg-indigo-500 selection:text-white">
      {/* ── HERO SECTION ── */}
      <div className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-32 border-b border-slate-800/80">
        {/* Ambient Gradient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-indigo-600/25 via-violet-600/20 to-cyan-500/20 rounded-full blur-3xl pointer-events-none -z-10 animate-pulse-slow"></div>
        <div className="absolute top-10 right-10 w-72 h-72 bg-violet-600/15 rounded-full blur-3xl pointer-events-none -z-10"></div>
        <div className="absolute bottom-10 left-10 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none -z-10"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="lg:grid lg:grid-cols-12 lg:gap-12 items-center">
            
            {/* Left Content */}
            <div className="text-center lg:text-left lg:col-span-7 flex flex-col justify-center">
              
              {/* Release Badge */}
              <div className="inline-flex items-center gap-2 self-center lg:self-start bg-indigo-950/80 border border-indigo-500/40 rounded-full px-4 py-1.5 text-xs font-semibold text-indigo-300 mb-6 shadow-lg shadow-indigo-950/50 backdrop-blur-md">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
                <span className="text-slate-200">Next-Gen Industrial Label Suite</span>
                <span className="text-cyan-400 font-bold">• by Mithun Dev</span>
              </div>
              
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-5xl xl:text-6xl leading-[1.12]">
                Visual QR & Barcode{" "}
                <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                  Label Designer
                </span>{" "}
                <br className="hidden sm:inline" />& Batch Print Suite
              </h1>
              
              <p className="mt-6 text-base sm:text-lg leading-relaxed text-slate-300 max-w-2xl mx-auto lg:mx-0 font-normal">
                Design custom thermal and laser sticker labels with high-precision drag-and-drop. Map dynamic data schemas, preview live records, and stream directly to <span className="text-cyan-300 font-medium">ZPL Zebra printers</span>, multi-page <span className="text-indigo-300 font-medium">PDFs</span>, or <span className="text-violet-300 font-medium">PNG arrays</span> locally in your browser.
              </p>
              
              <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                <button
                  onClick={() => onNavigate("labels")}
                  className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 px-8 py-4 text-sm font-bold text-white shadow-xl shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:brightness-110 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <Layers size={18} />
                  <span>Launch Label Studio</span>
                  <ArrowRight size={16} />
                </button>
              </div>

              {/* Stats / Badges */}
              <div className="mt-12 pt-8 border-t border-slate-800/80 grid grid-cols-3 gap-4 max-w-lg mx-auto lg:mx-0 text-center lg:text-left">
                <div>
                  <p className="text-2xl font-black bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">100%</p>
                  <p className="text-xs text-slate-400 mt-0.5">Client-Side Privacy</p>
                </div>
                <div>
                  <p className="text-2xl font-black bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">ZPL + PDF</p>
                  <p className="text-xs text-slate-400 mt-0.5">Dual Output Engine</p>
                </div>
                <div>
                  <p className="text-2xl font-black bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">Zero Lag</p>
                  <p className="text-xs text-slate-400 mt-0.5">Optimized Canvas</p>
                </div>
              </div>

            </div>
            
            {/* Right Card / Interactive Preview Mockup */}
            <div className="mt-16 lg:col-span-5 lg:mt-0 flex items-center justify-center relative">
              <div className="relative rounded-3xl bg-slate-900/80 p-6 shadow-2xl border border-slate-800/90 backdrop-blur-xl w-full max-w-md glow-indigo">
                
                {/* Window Top Controls */}
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-950/80 text-[11px] font-mono text-slate-400 border border-slate-800">
                    <Flame size={12} className="text-amber-400" />
                    <span>studio-config.tsx</span>
                  </div>
                </div>

                {/* Code Window */}
                <div className="font-mono text-xs text-slate-300 space-y-1.5 leading-relaxed bg-slate-950/90 p-4 rounded-xl border border-slate-800/60 overflow-x-auto">
                  <p><span className="text-indigo-400">import</span> &#123; <span className="text-cyan-300">QRLabelDesigner</span> &#125; <span className="text-indigo-400">from</span> <span className="text-emerald-300">'react-qr-label'</span>;</p>
                  <p><span className="text-indigo-400">import</span> <span className="text-emerald-300">'react-qr-label/style.css'</span>;</p>
                  <p className="text-slate-600 py-1">// Professional embeddable studio</p>
                  <p className="text-violet-400">&lt;<span className="text-cyan-300">QRLabelDesigner</span></p>
                  <p className="pl-4 text-slate-300">initialLayout=&#123;<span className="text-amber-300">workforceBadge</span>&#125;</p>
                  <p className="pl-4 text-slate-300">entitySchemas=&#123;<span className="text-amber-300">customSchemas</span>&#125;</p>
                  <p className="pl-4 text-slate-300">onSave=&#123;(<span className="text-indigo-300">layout</span>) =&gt; <span className="text-cyan-300">syncToDatabase</span>(layout)&#125;</p>
                  <p className="text-violet-400">/&gt;</p>
                </div>

                {/* Mini Features List inside Card */}
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2.5">
                    <Printer size={16} className="text-cyan-400 shrink-0" />
                    <div className="text-[11px] font-medium text-slate-300 leading-tight">Direct Thermal Print</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2.5">
                    <Sparkles size={16} className="text-indigo-400 shrink-0" />
                    <div className="text-[11px] font-medium text-slate-300 leading-tight">Live Variable Merge</div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── INTERACTIVE PRESETS SECTION ── */}
      <div className="py-20 sm:py-28 bg-slate-900/60 border-b border-slate-800/80 relative">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          
          <div className="mx-auto max-w-3xl text-center mb-16">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/80 border border-indigo-800/50 mb-3">
              <Sparkles size={12} />
              Ready-Made Presets
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Choose an Industrial Story & Launch
            </h2>
            <p className="mt-4 text-base text-slate-400 leading-relaxed">
              Select one of the pre-configured templates below to immediately populate the canvas with a full schema, realistic records, and layout geometry.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            
            {/* Story 1: Workforce ID Badges */}
            <div className="bg-slate-950/80 rounded-3xl border border-slate-800 p-8 flex flex-col justify-between shadow-xl hover:border-indigo-500/60 transition-all duration-300 group hover:shadow-indigo-500/10">
              <div>
                <div className="h-14 w-14 bg-indigo-950/80 border border-indigo-700/50 rounded-2xl flex items-center justify-center text-indigo-400 mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-indigo-950/60">
                  <Users size={26} />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-bold text-white">Workforce Security Badges</h3>
                  <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded-full">
                    100 × 60 mm
                  </span>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  Design identity cards, personnel passes, and visitor badges. Automatically bind employee names, photos, departments, and encoded check-in scan URLs.
                </p>
              </div>
              <button
                onClick={() => handleLoadWorkflow("default-emp-layout")}
                className="w-full bg-slate-900 hover:bg-gradient-to-r hover:from-indigo-600 hover:to-violet-600 text-slate-200 hover:text-white border border-slate-700/80 hover:border-transparent rounded-xl py-3.5 text-sm font-bold transition-all duration-200 cursor-pointer text-center flex items-center justify-center gap-2 shadow-md active:scale-98"
              >
                <span>Load Staff Badge Preset</span>
                <ArrowRight size={15} />
              </button>
            </div>

            {/* Story 2: Industrial Asset Tags */}
            <div className="bg-slate-950/80 rounded-3xl border border-slate-800 p-8 flex flex-col justify-between shadow-xl hover:border-violet-500/60 transition-all duration-300 group hover:shadow-violet-500/10">
              <div>
                <div className="h-14 w-14 bg-violet-950/80 border border-violet-700/50 rounded-2xl flex items-center justify-center text-violet-400 mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-violet-950/60">
                  <Cpu size={26} />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-bold text-white">Equipment & Machinery Plates</h3>
                  <span className="text-[10px] font-bold text-violet-400 bg-violet-950/60 border border-violet-800/40 px-2 py-0.5 rounded-full">
                    3 × 2 in
                  </span>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  Print rugged spec plates for CNC machines, servers, and warehouse tools. Embed dynamic QR codes linking to maintenance schedules and serial numbers.
                </p>
              </div>
              <button
                onClick={() => handleLoadWorkflow("default-machine-layout")}
                className="w-full bg-slate-900 hover:bg-gradient-to-r hover:from-violet-600 hover:to-indigo-600 text-slate-200 hover:text-white border border-slate-700/80 hover:border-transparent rounded-xl py-3.5 text-sm font-bold transition-all duration-200 cursor-pointer text-center flex items-center justify-center gap-2 shadow-md active:scale-98"
              >
                <span>Load Asset Plate Preset</span>
                <ArrowRight size={15} />
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* ── 3-STEP PIPELINE TOUR ── */}
      <div className="py-20 sm:py-28 bg-slate-950 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="mx-auto max-w-3xl text-center mb-16">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/80 border border-cyan-800/50 mb-3">
              Developer Tour
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              End-to-End Label Pipeline in 3 Steps
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Step 1 */}
            <div className="relative flex flex-col p-8 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
              <div className="h-12 w-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 flex items-center justify-center font-bold text-lg mb-6 shadow-inner">
                01
              </div>
              <h4 className="font-bold text-lg text-white mb-2">Embed Canvas Studio</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Drop <code>&lt;QRLabelDesigner /&gt;</code> into any React layout. Responsive canvas coordinates, undo/redo state history, and element controls run out of the box.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative flex flex-col p-8 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
              <div className="h-12 w-12 rounded-2xl bg-violet-600/20 text-violet-400 border border-violet-500/40 flex items-center justify-center font-bold text-lg mb-6 shadow-inner">
                02
              </div>
              <h4 className="font-bold text-lg text-white mb-2">Map Dynamic Schemas</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Pass in your database entities. The visual editor creates drag pills so users map dynamic field tokens like <code>&#123;&#123;fullName&#125;&#125;</code> seamlessly.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative flex flex-col p-8 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
              <div className="h-12 w-12 rounded-2xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center font-bold text-lg mb-6 shadow-inner">
                03
              </div>
              <h4 className="font-bold text-lg text-white mb-2">Headless Batch Print</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Send layout JSON and dataset arrays to <code>StickerPrinter</code> to generate multi-record PDFs, image sets, or Zebra thermal printer ZPL commands.
              </p>
            </div>

          </div>
        </div>
      </div>

      {/* ── CORE CAPABILITIES ── */}
      <div className="py-20 sm:py-28 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 items-center">
            
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/80 border border-indigo-800/50 px-3 py-1 rounded-full">
                Core Engine
              </span>
              <h3 className="text-3xl font-extrabold text-white mt-4 mb-8">
                Engineered for High-Precision Applications
              </h3>
              
              <div className="space-y-6">
                <div className="flex gap-4 p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80">
                  <div className="h-11 w-11 shrink-0 bg-indigo-950 rounded-xl flex items-center justify-center text-indigo-400 border border-indigo-800/50">
                    <Zap size={22} />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-base">ZPL Industrial Command Generator</h4>
                    <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                      Converts visual canvas layouts into native Zebra Programming Language (^XA...^XZ). Stream directly to thermal printers over raw TCP or USB.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80">
                  <div className="h-11 w-11 shrink-0 bg-violet-950 rounded-xl flex items-center justify-center text-violet-400 border border-violet-800/50">
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-base">Synchronized Ref Render Architecture</h4>
                    <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                      Maintains instant response and fluid drag interactions without unnecessary React re-renders. Full multi-tier undo & redo stack.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80">
                  <div className="h-11 w-11 shrink-0 bg-cyan-950 rounded-xl flex items-center justify-center text-cyan-400 border border-cyan-800/50">
                    <Shield size={22} />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-base">Zero Server Uploads & 100% Client-Side</h4>
                    <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                      All barcode parsing, PDF rendering, and graphic processing execute locally in the browser sandbox. Strict data privacy.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* CTA panel */}
            <div className="relative rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-900 p-8 sm:p-12 text-white flex flex-col justify-center overflow-hidden shadow-2xl glow-indigo border border-indigo-400/20">
              <div className="relative z-10 text-center lg:text-left">
                <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-cyan-300 bg-black/30 px-3 py-1 rounded-full mb-4">
                  <Sparkles size={12} />
                  Interactive Environment
                </span>
                <h3 className="text-3xl font-extrabold mb-4 leading-tight">
                  Ready to design your first industrial label?
                </h3>
                <p className="text-indigo-100 mb-8 max-w-sm mx-auto lg:mx-0 text-sm sm:text-base leading-relaxed">
                  Open the studio now to create, edit, customize dimensions, and batch-print mock databases.
                </p>
                <button
                  onClick={() => onNavigate("labels")}
                  className="w-full sm:w-auto bg-white hover:bg-slate-100 text-indigo-900 px-8 py-4 rounded-xl font-bold transition-all cursor-pointer shadow-xl hover:shadow-2xl active:scale-95 text-sm flex items-center justify-center gap-2"
                >
                  <span>Launch Label Studio</span>
                  <ArrowRight size={16} />
                </button>
              </div>
              <div className="absolute -right-16 -bottom-16 opacity-10 pointer-events-none">
                <Layout size={320} />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="py-8 bg-slate-950 border-t border-slate-800/80 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} QR Label Studio • Crafted by <span className="text-slate-300 font-semibold">Mithun Dev</span></p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>High-Speed Vector Rendering</span>
            <span>•</span>
            <span>ZPL Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
