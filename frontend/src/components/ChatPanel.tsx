import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  messages: any[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onSettings: () => void;
  setTheme: (t: 'dark' | 'medium' | 'light') => void; // Добавили пропс
  currentTheme: 'dark' | 'medium' | 'light'; // Добавили пропс
  themeStyles: any;
  scrollRef: any;
}

export const ChatPanel = ({ messages, input, setInput, onSend, onSettings, setTheme, currentTheme, themeStyles, scrollRef }: Props) => (
  <div className={`w-[420px] flex flex-col border-r z-20 shadow-xl ${themeStyles.border} ${themeStyles.panel} transition-all duration-500`}>
    <header className={`px-5 py-5 flex justify-between items-center border-b shrink-0 ${themeStyles.border}`}>
      <h1 onDoubleClick={onSettings} className={`text-[10px] tracking-[0.4em] font-bold uppercase cursor-pointer hover:text-blue-500 transition-all ${currentTheme === 'light' ? 'text-black' : 'text-white/60'}`}>
        AIC-RG STUDIO <span className="opacity-20 ml-1">PRO</span>
      </h1>
      
      {/* ВОЗВРАЩАЕМ КНОПКИ ТЕМ */}
      <div className="flex gap-2">
        {(['dark', 'medium', 'light'] as const).map(t => (
          <button 
            key={t} 
            onClick={() => setTheme(t)} 
            className={`w-2.5 h-2.5 rounded-full border transition-all ${
              t === 'dark' ? 'bg-black border-white/10' : 
              t === 'medium' ? 'bg-gray-500 border-white/10' : 
              'bg-white border-black/10'
            } ${currentTheme === t ? 'ring-1 ring-blue-500 scale-110 shadow-sm' : 'opacity-20 hover:opacity-100'}`} 
          />
        ))}
      </div>
    </header>

    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth">
      {messages.map((m, i) => (
        <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2`}>
          <div className={`max-w-[92%] p-4 rounded-2xl border text-[13px] leading-relaxed shadow-sm transition-all ${themeStyles.card} ${m.role === 'user' ? 'bg-blue-600/10 border-blue-500/20 text-white' : themeStyles.text}`}>
            <div className={`prose prose-sm max-w-none ${currentTheme === 'light' ? 'prose-slate' : 'prose-invert'}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      ))}
      <div className="h-10" />
    </div>

    <div className="p-4 border-t border-current/5 shrink-0">
      <div className={`flex items-end gap-2 border border-current/10 rounded-2xl p-2 transition-all ${currentTheme === 'light' ? 'bg-black/5' : 'bg-white/5'}`}>
        <textarea 
          rows={1}
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), onSend())}
          placeholder="How can we build today?" 
          className={`flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-3 resize-none outline-none min-h-[44px] max-h-32 ${currentTheme === 'light' ? 'text-black' : 'text-white'}`} 
        />
        <button onClick={onSend} className="p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 active:scale-90 transition-all">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        </button>
      </div>
    </div>
  </div>
);