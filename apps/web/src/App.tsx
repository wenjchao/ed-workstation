import { useState, useEffect } from 'react';

// --- 資料型別定義 ---
interface Note {
  id: number;
  date: string;
  type: string;
  title: string;
  content: string;
}

interface Order {
  id: number;
  code: string;
  name: string;
  time: string;
  status: string;
}

interface AiSuggestion {
  diagnoses: { name: string; prob: number; reason: string }[];
  recommendations: { code: string; name: string; reason: string }[];
}

export default function App() {
  // --- 狀態管理 ---
  const [notes, setNotes] = useState<Note[]>(() => {
    const saved = localStorage.getItem('er-notes');
    return saved ? JSON.parse(saved) : [
      { id: 1, date: '12/25', type: 'Admission Note', title: '初步評估', content: '患者主訴胸痛...' }
    ];
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('er-orders');
    return saved ? JSON.parse(saved) : [
      { id: 1, code: 'IV001', name: 'N/S 500ml IV drip', time: '08:45', status: 'Active' }
    ];
  });

  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [orderInput, setOrderInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiSuggestion | null>(null);
  const [selectedAiOrders, setSelectedAiOrders] = useState<string[]>([]);

  // --- 自動存檔 ---
  useEffect(() => {
    localStorage.setItem('er-notes', JSON.stringify(notes));
    localStorage.setItem('er-orders', JSON.stringify(orders));
  }, [notes, orders]);

  // --- 病歷操作 ---
  const handleSaveNote = () => {
    if (!editingNote) return;
    if (notes.find(n => n.id === editingNote.id)) {
      setNotes(notes.map(n => n.id === editingNote.id ? editingNote : n));
    } else {
      setNotes([{ ...editingNote, id: Date.now() }, ...notes]);
    }
    setEditingNote(null);
  };

  // --- 醫囑操作 ---
  const handleAddOrder = (rawInput: string) => {
    const val = rawInput.trim();
    if (!val) return;
    const [code, ...nameParts] = val.split(' ');
    const newOrder: Order = {
      id: Date.now(),
      code: code.toUpperCase(),
      name: nameParts.join(' ') || 'General Order',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'Sent'
    };
    setOrders([newOrder, ...orders]);
    setOrderInput('');
  };

  // --- AI 模擬分析 ---
  const runAiAnalysis = () => {
    setIsAiLoading(true);
    setAiResult(null);
    // 模擬 AI 延遲
    setTimeout(() => {
      const mockResult: AiSuggestion = {
        diagnoses: [
          { name: "Acute Myocardial Infarction", prob: 85, reason: "基於胸痛持續與年齡風險" },
          { name: "Aortic Dissection", prob: 10, reason: "需經影像排除" },
          { name: "GERD", prob: 5, reason: "症狀不典型但不能排除" }
        ],
        recommendations: [
          { code: "BLOOD002", name: "Troponin-I serial", reason: "追蹤心肌酶變化" },
          { code: "IMG005", name: "Chest CT with contrast", reason: "排除主動脈剝離" },
          { code: "MED001", name: "Aspirin 300mg PO", reason: "AMI 標準首選用藥" }
        ]
      };
      setAiResult(mockResult);
      setIsAiLoading(false);
    }, 1500);
  };

  const applyAiOrders = () => {
    const recommended = aiResult?.recommendations.filter(r => selectedAiOrders.includes(r.code)) || [];
    const newOrders = recommended.map(r => ({
      id: Date.now() + Math.random(),
      code: r.code,
      name: r.name,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'Sent'
    }));
    setOrders([...newOrders, ...orders]);
    setAiResult(null);
    setSelectedAiOrders([]);
  };

  return (
    <div className="h-screen w-screen bg-slate-900 text-slate-100 flex flex-col p-2 gap-2 overflow-hidden font-sans">
      
      {/* 1. Patient Header */}
      <header className="h-16 bg-slate-800 border-l-4 border-blue-600 flex items-center px-4 rounded justify-between shrink-0 shadow-lg">
        <div className="flex gap-6 items-center">
            <div><span className="text-slate-500 text-[10px] block uppercase">患者姓名</span><span className="font-bold text-blue-100">王大明 (Wang, Da-Ming)</span></div>
            <div className="h-8 w-px bg-slate-700"></div>
            <div><span className="text-slate-500 text-[10px] block uppercase">病歷號碼</span><span className="font-mono font-bold">12345678</span></div>
            <div><span className="text-slate-500 text-[10px] block uppercase">性別/年齡</span><span className="font-bold">男 / 65歲</span></div>
            <div className="px-2 py-1 bg-red-900/40 border border-red-500/50 rounded text-red-400 font-bold text-xs animate-pulse">ER-012 (重症區)</div>
        </div>
        <div className="text-right text-slate-400 text-xs">
          到院時間: 2025-12-25 08:30
        </div>
      </header>

      {/* 2. Main Grid */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 overflow-hidden">
        
        {/* Note Section */}
        <section className="bg-slate-800 rounded border border-slate-700 flex flex-col overflow-hidden shadow-inner">
          <div className="p-3 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
            <h2 className="text-blue-400 font-bold flex items-center gap-2"><span>📄</span> 病歷記錄 (Notes)</h2>
            <button 
              onClick={() => setEditingNote({ id: 0, date: '12/25', type: 'Progress Note', title: '', content: '' })}
              className="bg-blue-600 hover:bg-blue-500 text-xs px-3 py-1 rounded transition-colors"
            >+ 新增</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {notes.map(n => (
              <div key={n.id} onClick={() => setEditingNote(n)} className="p-3 bg-slate-700/40 border border-slate-600/50 rounded hover:border-blue-500 cursor-pointer transition-all">
                <div className="flex justify-between text-[10px] text-blue-400 font-bold uppercase mb-1">
                  <span>{n.date}</span><span>{n.type}</span>
                </div>
                <div className="font-bold text-sm text-slate-200">{n.title || '(未命名標題)'}</div>
                <div className="text-xs text-slate-500 line-clamp-1 mt-1 font-mono">{n.content}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Order Section */}
        <section className="bg-slate-800 rounded border border-slate-700 flex flex-col overflow-hidden shadow-inner">
          <div className="p-3 border-b border-slate-700 bg-slate-800/50">
            <h2 className="text-green-400 font-bold flex items-center gap-2"><span>💊</span> 醫囑 (Orders)</h2>
          </div>
          <div className="p-2 border-b border-slate-700 bg-slate-900/30">
            <div className="flex gap-1">
              <input 
                value={orderInput}
                onChange={(e) => setOrderInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddOrder(orderInput)}
                type="text" placeholder="代碼 + 名稱 (ex: NUT01 早餐)" 
                className="flex-1 bg-slate-950 border border-slate-600 rounded px-3 py-1.5 text-sm focus:border-green-500 outline-none" 
              />
              <button onClick={() => handleAddOrder(orderInput)} className="bg-green-700 hover:bg-green-600 px-3 rounded text-sm transition-colors">執行</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 sticky top-0 text-slate-500 uppercase">
                <tr><th className="p-2">狀態</th><th className="p-2">內容</th><th className="p-2">時間</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {orders.map(o => (
                  <tr key={o.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="p-2"><span className="px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-500/30">{o.status}</span></td>
                    <td className="p-2">
                      <div className="font-bold text-slate-300 uppercase">{o.code}</div>
                      <div className="text-slate-500">{o.name}</div>
                    </td>
                    <td className="p-2 text-slate-500 font-mono">{o.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Result Section */}
        <section className="bg-slate-800 rounded border border-slate-700 flex flex-col overflow-hidden shadow-inner">
          <div className="p-3 border-b border-slate-700 bg-slate-800/50">
            <h2 className="text-yellow-500 font-bold flex items-center gap-2"><span>🧪</span> 報告結果 (Results)</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
             <div className="p-2 border-l-4 border-red-500 bg-red-900/10 rounded flex justify-between items-center">
                <div><div className="font-bold text-xs">Troponin-I (High Sensitive)</div><div className="text-lg font-mono text-red-400">0.450 ↑</div></div>
                <div className="text-[10px] text-slate-500 uppercase text-right">10:45 AM<br/>Abnormal</div>
             </div>
             <div className="p-2 border-l-4 border-green-500 bg-slate-700/30 rounded flex justify-between items-center">
                <div><div className="font-bold text-xs">WBC Count</div><div className="text-lg font-mono text-green-400">8.5</div></div>
                <div className="text-[10px] text-slate-500 uppercase text-right">09:15 AM<br/>Normal</div>
             </div>
          </div>
        </section>

        {/* D/D with AI Section */}
        <section className="bg-slate-800 rounded border border-slate-700 flex flex-col overflow-hidden shadow-inner relative">
          <div className="p-3 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
            <h2 className="text-purple-400 font-bold flex items-center gap-2"><span>🧠</span> AI 診斷輔助 (D/D)</h2>
            <button 
              disabled={isAiLoading}
              onClick={runAiAnalysis}
              className={`bg-purple-600 hover:bg-purple-500 px-3 py-1 rounded text-xs font-bold flex items-center gap-1 transition-all ${isAiLoading ? 'opacity-50' : ''}`}
            >
              {isAiLoading ? '分析中...' : '✦ AI 臨床分析'}
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3">
            {!aiResult && !isAiLoading && <div className="h-full flex items-center justify-center text-slate-500 text-xs italic text-center px-6">點擊上方按鈕，基於病歷與報告進行 AI 推理...</div>}
            
            {isAiLoading && (
              <div className="h-full flex flex-col items-center justify-center space-y-3">
                <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-xs text-purple-400 animate-pulse">正在閱讀病歷與實驗室數據...</div>
              </div>
            )}

            {aiResult && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">鑑別診斷機率</h4>
                  {aiResult.diagnoses.map(d => (
                    <div key={d.name}>
                      <div className="flex justify-between text-xs mb-1"><span>{d.name}</span><span className="font-bold text-purple-400">{d.prob}%</span></div>
                      <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden"><div className="bg-purple-500 h-full transition-all duration-1000" style={{ width: `${d.prob}%` }}></div></div>
                      <p className="text-[10px] text-slate-500 mt-1 italic">{d.reason}</p>
                    </div>
                  ))}
                </div>
                
                <div className="pt-4 border-t border-slate-700">
                  <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-2">推薦進階醫囑</h4>
                  <div className="space-y-2">
                    {aiResult.recommendations.map(r => (
                      <label key={r.code} className="flex items-start gap-3 p-2 bg-slate-900/50 rounded border border-purple-900/30 cursor-pointer hover:bg-purple-900/20 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={selectedAiOrders.includes(r.code)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedAiOrders([...selectedAiOrders, r.code]);
                            else setSelectedAiOrders(selectedAiOrders.filter(c => c !== r.code));
                          }}
                          className="mt-1 accent-purple-500" 
                        />
                        <div className="text-xs">
                          <div className="font-bold text-slate-200">{r.code} - {r.name}</div>
                          <div className="text-[10px] text-slate-500">{r.reason}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <button 
                    onClick={applyAiOrders}
                    disabled={selectedAiOrders.length === 0}
                    className="w-full mt-3 bg-purple-900/50 hover:bg-purple-800 text-purple-200 py-2 rounded text-xs font-bold border border-purple-500/30 transition-all disabled:opacity-30"
                  >
                    執行勾選醫囑 ({selectedAiOrders.length})
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 3. Note Modal */}
      {editingNote && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-800 border border-blue-500/50 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
              <h3 className="font-bold text-blue-300">編輯病歷記錄</h3>
              <button onClick={() => setEditingNote(null)} className="text-slate-500 hover:text-white transition-colors text-xl">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase mb-1">記錄類型</label>
                  <select 
                    value={editingNote.type}
                    onChange={(e) => setEditingNote({...editingNote, type: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm outline-none focus:border-blue-500"
                  >
                    <option>Admission Note</option>
                    <option>Progress Note</option>
                    <option>Consult Note</option>
                    <option>ER Summary</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase mb-1">標題</label>
                  <input 
                    value={editingNote.title}
                    onChange={(e) => setEditingNote({...editingNote, title: e.target.value})}
                    type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm outline-none focus:border-blue-500" placeholder="輸入記錄重點標題..." 
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase mb-1">內容詳細描述</label>
                <textarea 
                  value={editingNote.content}
                  onChange={(e) => setEditingNote({...editingNote, content: e.target.value})}
                  rows={12} 
                  className="w-full bg-slate-950 p-4 text-slate-200 outline-none rounded border border-slate-700 focus:border-blue-500 font-mono text-sm leading-relaxed"
                  placeholder="請依照 SOAP 格式或急診規範輸入內容..."
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-700 flex justify-end gap-3 bg-slate-800/50">
              <button onClick={() => setEditingNote(null)} className="px-6 py-2 border border-slate-600 rounded-lg text-sm hover:bg-slate-700 transition-colors">取消</button>
              <button onClick={handleSaveNote} className="px-8 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-bold shadow-lg transition-colors">儲存病歷</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}