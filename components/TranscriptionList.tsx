
import React, { useEffect, useRef } from 'react';
import { TranscriptionEntry } from '../types';

interface TranscriptionListProps {
  entries: TranscriptionEntry[];
  isThinking: boolean;
}

const TranscriptionList: React.FC<TranscriptionListProps> = ({ entries, isThinking }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, isThinking]);

  return (
    <div 
      ref={scrollRef}
      className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar"
    >
      {entries.length === 0 && !isThinking && (
        <div className="flex flex-col items-center justify-center h-full opacity-10">
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-center">Neural Link Standby</p>
        </div>
      )}
      
      {entries.map((entry) => (
        <div 
          key={entry.id} 
          className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'}`}
        >
          <div className={`max-w-[90%] rounded-2xl px-4 py-2 text-sm transition-all duration-300 ${
            entry.role === 'user' 
              ? 'bg-zinc-800/80 text-zinc-300' 
              : 'bg-cyan-500/10 text-cyan-50 border border-cyan-500/20'
          }`}>
            <p className="leading-snug">{entry.text}</p>
          </div>
          <span className={`text-[8px] mt-1 uppercase tracking-[0.2em] font-black opacity-30 ${
            entry.role === 'user' ? 'text-zinc-500 pr-2' : 'text-cyan-500 pl-2'
          }`}>
            {entry.role === 'user' ? 'Engineer' : 'ARC'}
          </span>
        </div>
      ))}

      {isThinking && (
        <div className="flex items-start">
          <div className="bg-cyan-500/5 rounded-full px-4 py-2 text-[8px] font-black tracking-widest text-cyan-400 uppercase animate-pulse">
             Calculating Architecture...
          </div>
        </div>
      )}
    </div>
  );
};

export default TranscriptionList;
