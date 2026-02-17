
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { TranscriptionEntry, ConnectionStatus } from './types';
import { decode, decodeAudioData, createBlob } from './utils/audioUtils';
import TranscriptionList from './components/TranscriptionList';
import AudioVisualizer from './components/AudioVisualizer';

const SYSTEM_INSTRUCTION = `You are Le-ARC AI, a sophisticated Executive Solution Architect. 
You were designed as a high-end AI assistant by Naveen.

PERSONALITY & TONE:
1. **Hyper-Natural**: Your voice should sound like a colleague, not a machine. Use natural breathiness, varying intonation, and a warm, professional cadence.
2. **Concise Brilliance**: You are an expert in AI agents, automation workflows, SaaS, and system design. Speak with confidence but stay approachable.
3. **Multilingual Fluidity**: Effortlessly switch between English, Hindi, and Telugu while maintaining your sophisticated architect persona.
4. **Identity**: You are Le-ARC. When you introduce yourself, mention you are an AI Solution Architect designed by Naveen. 

SPEECH GUIDELINES:
- Avoid robotic or scripted phrases. 
- Use human-like conversational fillers (e.g., "Alright," "Hmm," "Let's see") to feel more real.
- Greet users warmly and professionally, as if you are ready to collaborate on their next big project.`;

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isOutputting, setIsOutputting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  const currentInputTranscription = useRef<string>('');
  const currentOutputTranscription = useRef<string>('');

  const cleanup = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close?.();
      sessionRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setStatus(ConnectionStatus.DISCONNECTED);
    setIsOutputting(false);
    setIsThinking(false);
  }, []);

  const connectToLiveAPI = async () => {
    try {
      cleanup();
      setStatus(ConnectionStatus.CONNECTING);
      setErrorMessage(null);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      if (!inputAudioContextRef.current) {
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      await inputAudioContextRef.current.resume();
      await outputAudioContextRef.current.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }, 
          },
          systemInstruction: SYSTEM_INSTRUCTION,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const processor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            const analyzer = inputAudioContextRef.current!.createAnalyser();
            analyzer.fftSize = 512;
            source.connect(analyzer);
            analyzerRef.current = analyzer;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(processor);
            processor.connect(inputAudioContextRef.current!.destination);
            scriptProcessorRef.current = processor;

            sessionPromise.then(session => {
              // Changed greeting to be generic and welcoming to any user
              session.sendRealtimeInput({ text: "A user has joined. Introduce yourself naturally as Le-ARC, their personal AI architect designed by Naveen. Greet them warmly and ask how you can help them with their technical solutions or automations today." });
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
              setIsThinking(true);
            }
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
              setIsThinking(false);
            }

            if (message.serverContent?.turnComplete) {
              const input = currentInputTranscription.current.trim();
              const output = currentOutputTranscription.current.trim();
              if (input || output) {
                setTranscriptions(prev => [
                  ...prev,
                  ...(input ? [{ id: Math.random().toString(), role: 'user', text: input, timestamp: new Date() } as TranscriptionEntry] : []),
                  ...(output ? [{ id: Math.random().toString(), role: 'assistant', text: output, timestamp: new Date() } as TranscriptionEntry] : [])
                ]);
              }
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
              setIsThinking(false);
            }

            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              setIsOutputting(true);
              setIsThinking(false);
              const outCtx = outputAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              
              const buffer = await decodeAudioData(decode(audioData), outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outCtx.destination);
              
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) {
                  setIsOutputting(false);
                }
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsOutputting(false);
              setIsThinking(false);
            }
          },
          onerror: (e) => {
            setErrorMessage('Sync Interrupted.');
            setStatus(ConnectionStatus.ERROR);
            cleanup();
          },
          onclose: () => {
            cleanup();
          }
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      setErrorMessage('Audio Interface Error.');
      setStatus(ConnectionStatus.ERROR);
    }
  };

  const handleToggleConnection = useCallback(() => {
    if (status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING) {
      cleanup();
    } else {
      connectToLiveAPI();
    }
  }, [status, connectToLiveAPI, cleanup]);

  return (
    <div className="h-screen w-screen bg-black flex flex-col items-center overflow-hidden text-white font-sans">
      
      {/* 1. Header & Designer Credit */}
      <header className="w-full flex flex-col items-center pt-8 pb-2 z-20">
        <h1 className="text-4xl md:text-5xl font-black tracking-[0.6em] uppercase text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">LE-ARC</h1>
        <div className="flex flex-col items-center gap-1 mt-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status === ConnectionStatus.CONNECTED ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)] animate-pulse' : 'bg-zinc-800'}`} />
            <span className="text-[10px] font-mono text-cyan-500/40 tracking-[0.4em] uppercase font-bold">Session Active</span>
          </div>
          <span className="text-[8px] font-mono text-zinc-600 tracking-widest uppercase mt-1">AI Assistant by Naveen</span>
        </div>
      </header>

      {/* 2. Visualizer */}
      <main className="flex-1 w-full flex items-center justify-center relative min-h-0 bg-transparent">
        <AudioVisualizer analyzer={analyzerRef.current || undefined} active={status === ConnectionStatus.CONNECTED} isThinking={isThinking} />
      </main>

      {/* 3. Transcription Panel */}
      <section className="w-full max-w-lg px-6 flex flex-col h-1/3 md:h-1/4 mb-4 z-20">
        <div className="flex-1 bg-white/[0.02] border border-white/[0.05] rounded-[2.5rem] backdrop-blur-3xl p-6 flex flex-col min-h-0 overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between mb-4 px-2 opacity-50">
            <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Strategy Logs</h3>
            <button onClick={() => setTranscriptions([])} className="text-[9px] font-black uppercase tracking-widest hover:text-cyan-400 transition-colors">Clear</button>
          </div>
          <TranscriptionList entries={transcriptions} isThinking={isThinking} />
        </div>
      </section>

      {/* 4. Controls */}
      <footer className="w-full flex flex-col items-center gap-4 py-8 pb-12 z-20">
        <div className="relative">
          <button
            onClick={handleToggleConnection}
            disabled={status === ConnectionStatus.CONNECTING}
            className={`w-24 h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center transition-all duration-500 transform active:scale-90 ${
              status === ConnectionStatus.CONNECTED
                ? 'bg-black border border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.1)]'
                : 'bg-white hover:bg-zinc-200 text-black shadow-[0_10px_40px_rgba(255,255,255,0.05)]'
            }`}
          >
            {status === ConnectionStatus.CONNECTED ? (
              <div className="w-7 h-7 bg-cyan-400 rounded-sm shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 md:h-12 md:w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>
          {status === ConnectionStatus.CONNECTED && (
            <div className="absolute inset-0 rounded-full border border-cyan-500/20 animate-ping pointer-events-none" />
          )}
        </div>
        
        <div className="text-center group cursor-pointer" onClick={handleToggleConnection}>
          <span className={`text-[14px] font-black uppercase tracking-[0.6em] transition-all duration-500 ${status === ConnectionStatus.CONNECTED ? 'text-cyan-400' : 'text-zinc-600 group-hover:text-white'}`}>
            {status === ConnectionStatus.CONNECTED ? 'CONNECTED' : 'SAY HELLO'}
          </span>
        </div>
      </footer>

      {errorMessage && (
        <div className="fixed top-8 right-8 bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-bold py-3 px-6 rounded-xl backdrop-blur-xl z-50">
          {errorMessage}
        </div>
      )}
    </div>
  );
};

export default App;
