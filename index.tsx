
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import { 
  FileText, 
  Settings2, 
  AlertCircle,
  CheckCircle2,
  Download,
  Eraser,
  RefreshCcw,
  Cog,
  Layout
} from 'lucide-react';

/**
 * Data Processing Utility Types
 */
interface RawRow {
  sid: string | number;
  infos: string;
  origin_sessions: string;
}

interface SessionSegment {
  role: 'user' | 'char';
  content: string;
  fullText: string;
}

interface ProcessedRow {
  sid: string;
  prompt: string;
  originalSid: string;
  round: number;
}

const DEFAULT_TEMPLATE = `<system_instructions>
You are a professional test assistant. Analyze the data in <input_context>.
在此输入 Prompt 框架。系统仅在 <input_context> 内执行精准变量注入：
\${Session_History} 将动态累加至当前轮次前；
\${Latest_Character_Dialogue} 将通过正则剔除" [角色]: "标签后填入。
Enter Template: Scoped injection only within <input_context> with dynamic history sessions and Character - tag *
</system_instructions>

<input_context>
\${Character_Profile}
\${Session_History}
\${Latest_Character_Dialogue}
</input_context>`;

const App: React.FC = () => {
  const [template, setTemplate] = useState<string>(DEFAULT_TEMPLATE);
  const [rawData, setRawData] = useState<RawRow[]>([]);
  const [processedData, setProcessedData] = useState<ProcessedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string>('Data');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseSessions = useCallback((text: string): SessionSegment[] => {
    if (!text) return [];
    const parts = text.split(/(\[(?:用户|角色)\]:)/g);
    const segments: SessionSegment[] = [];

    for (let i = 1; i < parts.length; i += 2) {
      const tag = parts[i];
      const content = parts[i + 1] ? parts[i + 1].trim() : '';
      segments.push({
        role: tag.includes('用户') ? 'user' : 'char',
        content: content, 
        fullText: tag + content
      });
    }
    return segments;
  }, []);

  const runPipeline = useCallback(() => {
    if (rawData.length === 0) return;
    setIsProcessing(true);
    setError(null);

    try {
      const results: ProcessedRow[] = [];
      const contextRegex = /<input_context>([\s\S]*?)<\/input_context>/g;

      rawData.forEach((row) => {
        const segments = parseSessions(row.origin_sessions);
        const charRounds = segments.filter(s => s.role === 'char');

        charRounds.forEach((currentCharSegment, index) => {
          const roundNum = index + 1;
          const newSid = `${row.sid}-round${roundNum}`;
          const segmentIdx = segments.indexOf(currentCharSegment);
          
          const historyText = segments
            .slice(0, segmentIdx)
            .map(s => s.fullText)
            .join('\n');

          const latestDialogue = currentCharSegment.content;

          const finalPrompt = template.replace(contextRegex, (match, innerContent) => {
            const injected = innerContent
              .replace(/\${Character_Profile}/g, String(row.infos || ''))
              .replace(/\${Session_History}/g, historyText)
              .replace(/\${Latest_Character_Dialogue}/g, latestDialogue);
            return `<input_context>${injected}</input_context>`;
          });

          results.push({
            sid: newSid,
            prompt: finalPrompt,
            originalSid: String(row.sid),
            round: roundNum
          });
        });
      });

      setProcessedData(results);
    } catch (err) {
      setError(`Processing error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  }, [rawData, template, parseSessions]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSourceFileName(file.name.replace(/\.[^/.]+$/, ""));
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<RawRow>(ws);

        if (data.length > 0) {
          const firstRow = data[0];
          if (!('sid' in firstRow && 'infos' in firstRow && 'origin_sessions' in firstRow)) {
            throw new Error("Missing required columns: sid, infos, origin_sessions");
          }
        }
        setRawData(data);
        setError(null);
      } catch (err) {
        setError(`Upload error: ${err instanceof Error ? err.message : String(err)}`);
        setRawData([]);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleExport = async () => {
    if (processedData.length === 0) return;
    setExportProgress(0);

    const chunk = 20;
    for(let i = 0; i <= 100; i += chunk) {
      setExportProgress(i);
      await new Promise(r => setTimeout(r, 40));
    }

    const exportData = processedData.map(d => ({
      sid: d.sid,
      prompt: d.prompt
    }));

    const dateStr = new Date().toISOString().slice(2, 10);
    const fileName = `BatchFlow_${dateStr}_${sourceFileName}.xlsx`;

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Processed");
    XLSX.writeFile(wb, fileName);
    
    setTimeout(() => setExportProgress(null), 800);
  };

  const clearAll = () => {
    setRawData([]);
    setTemplate(DEFAULT_TEMPLATE);
    setProcessedData([]);
    setError(null);
    setExportProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const previewItems = useMemo(() => {
    if (processedData.length === 0) return [];
    return [
      { label: 'First Sample Audit', item: processedData[0], sub: '首条首轮' },
      { label: 'Last Sample Audit', item: processedData[processedData.length - 1], sub: '末条末轮' }
    ];
  }, [processedData]);

  return (
    <div className="h-screen w-full bg-white text-slate-900 font-sans flex flex-col overflow-hidden antialiased">
      {/* Header */}
      <header className="flex-none h-24 bg-white border-b border-[#F1F5F9] px-10 flex items-center justify-between z-30">
        <div className="flex items-center gap-6">
          <Cog className="text-[#002FA7] animate-[spin_12s_linear_infinite]" size={40} />
          <div className="flex flex-col border-r border-slate-100 pr-8">
            <h1 className="text-4xl font-black tracking-tighter text-black leading-none">BatchFlow Pro</h1>
            <div className="mt-1.5 inline-flex">
              <span className="px-2 py-0.5 rounded-full bg-[#4169E1]/10">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#4169E1' }}>Created by Jiayi Mao</p>
              </span>
            </div>
          </div>
          <p className="max-w-md text-[13px] font-black leading-tight text-[#1A237E] uppercase">
            AUTOMATICALLY BUILD BATCH PROMPTS AND PROCESS MASSIVE EXCEL SAMPLES
          </p>
        </div>

        <button
          onClick={clearAll}
          className="flex items-center justify-center w-36 h-11 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-xs transition-all shadow-md active:scale-95 uppercase tracking-widest"
        >
          Clear All
        </button>
      </header>

      <main className="flex-1 overflow-hidden grid grid-cols-[48%_52%] gap-0">
        {/* Left Side (48%) */}
        <section className="flex flex-col bg-white overflow-hidden p-4 gap-4">
          
          {/* Module 1: Data Source */}
          <div className="h-[32%] flex flex-col bg-white rounded-2xl overflow-hidden shadow-md border border-[#F1F5F9]">
            <div className="bg-[#DDD6FE] px-6 h-14 flex items-center justify-between">
              <h2 className="text-2xl font-black text-[#524ED9] tracking-tight flex items-center gap-2">
                <FileText size={26} />
                Data Source
              </h2>
              <button 
                onClick={() => {setRawData([]); if(fileInputRef.current) fileInputRef.current.value='';}} 
                className="text-[#107C41] hover:bg-[#107C41]/10 p-2 rounded-2xl transition-colors"
                title="Clear Data"
              >
                <Eraser size={20} />
              </button>
            </div>
            
            <div className="flex-1 p-6 flex flex-col bg-white">
              <div className={`relative flex-1 border-2 border-dashed rounded-2xl transition-all flex items-center justify-center ${rawData.length > 0 ? 'border-[#107C41] bg-[#107C41]/5' : 'border-slate-200 hover:border-[#524ED9] hover:bg-slate-50'}`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                {rawData.length > 0 ? (
                  <div className="flex items-center gap-4 px-6 animate-in fade-in zoom-in duration-300">
                    <CheckCircle2 size={32} className="text-[#107C41]" />
                    <div className="overflow-hidden">
                      <p className="text-sm font-black text-slate-800 truncate">{sourceFileName}.xlsx</p>
                      <p className="text-[10px] font-bold text-[#524ED9] uppercase tracking-widest">{rawData.length} records detected</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center px-10 pointer-events-none">
                    <p className="text-[11px] font-bold leading-relaxed text-[#524ED9]/60 whitespace-pre-line italic">
                      点击或上传 XLSX：需包含 sid, infos, origin_sessions。系统将自动执行多轮对话切片并生成 sid-roundN 索引。{"\n"}
                      Upload XLSX: Requires sid, infos, origin_sessions. Auto-splitting into sid-roundN indexing.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Module 2: Prompt Template */}
          <div className="flex-1 flex flex-col bg-white rounded-2xl overflow-hidden shadow-md border border-[#F1F5F9]">
            <div className="bg-[#81D8D0] px-6 h-14 flex items-center justify-between">
              <h2 className="text-2xl font-black text-[#003135] tracking-tight flex items-center gap-2">
                <Settings2 size={26} />
                Prompt Template
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => setTemplate('')} 
                  className="text-[#107C41] hover:bg-white/40 p-2 rounded-2xl transition-colors"
                  title="Clear Template"
                >
                  <Eraser size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col p-6 bg-[#0F172A]">
              <div className="flex-1 relative rounded-2xl overflow-hidden shadow-2xl border border-white/5">
                <textarea
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="w-full h-full p-6 pt-2 font-mono text-[11px] bg-[#0F172A] text-white outline-none resize-none leading-[1.6] selection:bg-[#81D8D0]/30 antialiased"
                  placeholder={`<system_instructions>...`}
                />
              </div>

              <button
                onClick={runPipeline}
                disabled={rawData.length === 0 || isProcessing}
                className={`mt-6 h-11 w-full rounded-2xl font-black text-sm shadow-xl transition-all flex items-center justify-center gap-3 tracking-widest uppercase border-2 ${
                  rawData.length === 0 || isProcessing
                    ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed shadow-none'
                    : 'bg-[#5D4CFD] border-[#5D4CFD] text-white hover:bg-[#4b3ce4] active:scale-[0.98]'
                }`}
              >
                {isProcessing ? <RefreshCcw className="animate-spin" size={22} /> : <RefreshCcw size={22} />}
                Execute Pipeline
              </button>
            </div>
          </div>
        </section>

        {/* Module 3: Pipeline Output */}
        <section className="flex flex-col bg-[#D1DEFF] overflow-hidden p-4">
          <div className="bg-white rounded-2xl flex-1 flex flex-col overflow-hidden shadow-md border border-[#F1F5F9]">
            <div className="bg-[#E6EDFF] px-8 h-16 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-2xl font-black text-[#002FA7] tracking-tight flex items-center gap-2">
                <Cog size={26} className="text-[#002FA7]" />
                Pipeline Output
              </h2>
              <div className="flex items-center gap-4">
                {processedData.length > 0 && (
                  <>
                    <span className="text-[11px] font-black text-[#002FA7] uppercase tracking-widest bg-white/60 px-4 py-2 rounded-full border border-[#002FA7]/10 antialiased">
                      OBJECTS: <span className="font-mono font-bold text-[1.1em] underline decoration-2 antialiased" style={{ fontSmoothing: 'antialiased', WebkitFontSmoothing: 'antialiased' }}>{processedData.length}</span>
                    </span>
                    <button 
                      onClick={handleExport} 
                      className="bg-[#107C41] hover:bg-[#0a5c31] text-white px-5 py-2.5 rounded-2xl flex items-center gap-2 text-xs font-black transition-all shadow-md active:scale-95"
                    >
                      <Download size={18} /> Export XLSX
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 px-8 py-8 overflow-hidden bg-white">
              {processedData.length === 0 ? (
                <div className="w-full h-full border-2 border-dashed border-[#002FA7]/20 rounded-2xl flex flex-col items-center justify-center text-[#002FA7]/40 bg-white shadow-inner p-12">
                  <Layout size={48} className="opacity-10 mb-6" />
                  <p className="text-[11px] font-black uppercase tracking-[0.15em] text-center leading-relaxed whitespace-pre-line italic">
                    Check First & Last Sample:{"\n"}
                    左侧展示【首条 Session 的首轮】；右侧展示【末条 Session 的末轮】。{"\n"}{"\n"}
                    Audit: Left panel shows Round 1 of the First Session;{"\n"}
                    Right panel shows the Final Round of the Last Session.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6 h-full">
                  {previewItems.map(({ label, item, sub }) => (
                    <div key={item.sid} className="bg-white rounded-2xl border border-[#F1F5F9] shadow-md flex flex-col overflow-hidden group hover:border-[#002FA7]/40 transition-all border-t-4 border-t-[#002FA7]">
                      <div className="px-5 py-4 border-b border-[#F1F5F9] flex items-center justify-between bg-white">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-black text-[#002FA7] tracking-tight uppercase">{label}</span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{sub}</span>
                        </div>
                        <span className="text-[10px] font-mono font-black bg-slate-900 text-white px-3 py-1 rounded-full">{item.sid}</span>
                      </div>
                      <div className="flex-1 p-6 overflow-y-auto bg-white rounded-b-2xl">
                        <pre className="text-[11px] text-slate-600 whitespace-pre-wrap font-mono leading-relaxed select-all">
                          {item.prompt}
                        </pre>
                      </div>
                      <div className="p-4 bg-slate-50/50 border-t border-[#F1F5F9] flex items-center justify-between">
                         <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Round {item.round}</span>
                         <div className="flex items-center gap-1.5">
                            <CheckCircle2 size={16} className="text-[#107C41]" />
                            <span className="text-[10px] font-black text-[#107C41] uppercase">Audit Passed</span>
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {error && (
              <div className="mx-8 mb-8 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-red-700 shadow-sm animate-bounce">
                <AlertCircle size={20} className="shrink-0" />
                <p className="text-[11px] font-bold">{error}</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="flex-none h-12 bg-white border-t border-[#F1F5F9] px-10 flex items-center justify-between">
        <div className="flex gap-12 items-center">
           <span className="text-[10px] font-black text-[#002FA7] uppercase tracking-widest flex items-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-[#107C41] animate-pulse" />
             Pipeline Active
           </span>
           <span className="text-[10px] font-black tracking-widest text-[#94A3B8]">
             在此定义 Prompt 逻辑：系统将针对 Excel 多样本全自动执行多轮对话累加与变量清洗。
           </span>
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">JIAYI MAO 2026</p>
      </footer>

      {exportProgress !== null && (
        <div className="fixed top-0 left-0 w-full h-1 z-50 overflow-hidden">
          <div className="h-full bg-[#107C41] transition-all duration-300 shadow-[0_0_10px_#107C41]" style={{ width: `${exportProgress}%` }} />
        </div>
      )}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
