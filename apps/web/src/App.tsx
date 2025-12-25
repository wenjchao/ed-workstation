import React, { useState, useEffect } from 'react';

// 定義 Note 的資料型別
interface Note {
  id: string;
  date: string;
  type: string;
  content: string;
}

export default function App() {
  // 1. 狀態管理：存取所有 Notes
  const [notes, setNotes] = useState<Note[]>(() => {
    const saved = localStorage.getItem('er-notes');
    return saved ? JSON.parse(saved) : [
      { id: '1', date: '12/25', type: 'Admission Note', content: '患者主訴胸痛...' },
      { id: '2', date: '12/25', type: 'Progress Note', content: '血壓穩定中...' }
    ];
  });

  // 2. 狀態管理：目前正在編輯哪一個 Note (null 代表沒在編輯)
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  // 3. 當 notes 變動時，自動存入 localStorage
  useEffect(() => {
    localStorage.setItem('er-notes', JSON.stringify(notes));
  }, [notes]);

  // 更新 Note 內容的函式
  const updateNote = (id: string, newContent: string) => {
    setNotes(notes.map(n => n.id === id ? { ...n, content: newContent } : n));
  };

  return (
    <div className="h-screen w-screen bg-slate-900 text-slate-100 flex flex-col p-2 gap-2 overflow-hidden">
      {/* Header */}
      <div className="h-12 bg-blue-900 flex items-center px-4 rounded shadow-lg shrink-0">
        <h1 className="text-xl font-bold tracking-tight">ER Workstation - 急診醫師工作站</h1>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 overflow-hidden">
        
        {/* Note Section (左上) */}
        <section className="bg-slate-800 p-4 rounded border border-slate-700 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center border-b border-slate-700 pb-2 mb-2">
            <h2 className="text-blue-400 font-bold">Notes (病歷條列)</h2>
            <button className="text-xs bg-blue-600 px-2 py-1 rounded">+ 新增</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {notes.map(note => (
              <div 
                key={note.id} 
                onClick={() => setEditingNote(note)}
                className="p-3 bg-slate-700/50 hover:bg-slate-700 cursor-pointer rounded flex justify-between border border-transparent hover:border-blue-500 transition-all"
              >
                <span className="font-mono text-slate-400">{note.date}</span>
                <span className="font-medium text-blue-200">{note.type}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Order Section (右上) */}
        <section className="bg-slate-800 p-4 rounded border border-slate-700 flex flex-col">
          <h2 className="text-green-400 font-bold border-b border-slate-700 pb-2 mb-2">Orders (醫令輸入)</h2>
          <div className="flex gap-2 mb-2">
            <input type="text" placeholder="醫令代碼 (ex: CBC001)" className="flex-1 bg-slate-900 border border-slate-600 p-2 text-sm rounded outline-none focus:border-green-500" />
            <button className="bg-green-700 px-4 py-1 rounded text-sm">執行</button>
          </div>
          <div className="flex-1 bg-slate-900/50 rounded p-2 text-xs text-slate-500 font-mono">
            {/* 醫令清單將顯示於此 */}
            等待輸入...
          </div>
        </section>

        {/* Result Section (左下) */}
        <section className="bg-slate-800 p-4 rounded border border-slate-700 overflow-hidden">
          <h2 className="text-yellow-400 font-bold border-b border-slate-700 pb-2 mb-2">Results (檢查報告)</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between border-b border-slate-700/50 py-1">
              <span>WBC</span><span className="text-red-400 font-bold">15.2 H</span>
            </div>
            <div className="flex justify-between border-b border-slate-700/50 py-1">
              <span>CRP</span><span className="text-red-400 font-bold">8.5 H</span>
            </div>
          </div>
        </section>

        {/* D/D Section (右下) */}
        <section className="bg-slate-800 p-4 rounded border border-slate-700 flex flex-col">
          <h2 className="text-red-400 font-bold border-b border-slate-700 pb-2 mb-2">D/D (AI 輔助診斷)</h2>
          <div className="flex-1 flex flex-col justify-center items-center gap-4">
             <p className="text-xs text-slate-400 text-center">點擊下方按鈕，讓 AI 分析病歷與報告</p>
             <button className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold shadow-xl transition-all">
                AI 臨床決策分析
             </button>
          </div>
        </section>
      </div>

      {/* Note 編輯彈窗 (Modal) */}
      {editingNote && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-blue-500 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-blue-300">{editingNote.type} - {editingNote.date}</h3>
              <button onClick={() => setEditingNote(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <textarea 
              className="flex-1 bg-slate-900 p-4 text-slate-100 outline-none resize-none font-mono leading-relaxed"
              value={editingNote.content}
              onChange={(e) => updateNote(editingNote.id, e.target.value)}
              placeholder="在此輸入病歷內容..."
            />
            <div className="p-4 border-t border-slate-700 text-right">
              <button 
                onClick={() => setEditingNote(null)}
                className="bg-blue-600 px-6 py-2 rounded-lg font-bold"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}