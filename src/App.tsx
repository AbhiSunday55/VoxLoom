/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Play, 
  Pause, 
  Square, 
  BookOpen, 
  Volume2, 
  Search, 
  FileText, 
  Loader2,
  X,
  Info,
  ExternalLink,
  MessageSquareText,
  Languages,
  Mic,
  MicOff,
  Image as ImageIcon,
  Sparkles
} from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import { cn } from './lib/utils';
import { 
  transcribeImageOrPdf, 
  getWordDefinition, 
  generateSpeech, 
  explainComplexText,
  transcribeAudio,
  generateCoverImage
} from './services/geminiService';

const VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
const ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [explanation, setExplanation] = useState<{ text: string; result: string; type: 'definition' | 'explanation' } | null>(null);
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Image Generation State
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState("1:1");
  const [generatedCover, setGeneratedCover] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isSpeakingRef = useRef(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      setTranscription('');
      setGeneratedCover(null);
      stopSpeech();
    }
  };

  const analyzeFile = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const text = await transcribeImageOrPdf(base64, file.type);
        setTranscription(text);
        setIsAnalyzing(false);
      };
    } catch (error) {
      console.error("Analysis failed:", error);
      setIsAnalyzing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          setIsAnalyzing(true);
          try {
            const text = await transcribeAudio(base64);
            setTranscription(prev => prev + (prev ? "\n\n" : "") + text);
          } catch (err) {
            console.error("Audio transcription failed:", err);
          } finally {
            setIsAnalyzing(false);
          }
        };
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleGenerateCover = async () => {
    if (!transcription) return;
    setIsGeneratingImage(true);
    try {
      const imageUrl = await generateCoverImage(transcription.slice(0, 200), selectedAspectRatio);
      setGeneratedCover(imageUrl);
    } catch (err) {
      console.error("Image generation failed:", err);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    
    if (text && text.length > 0) {
      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      if (rect) {
        setSelectionMenu({
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
          text: text
        });
      }
    } else {
      setSelectionMenu(null);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => document.removeEventListener('mouseup', handleTextSelection);
  }, [handleTextSelection]);

  const handleAction = async (type: 'definition' | 'explanation' | 'search') => {
    if (!selectionMenu) return;
    const text = selectionMenu.text;
    setSelectionMenu(null);

    if (type === 'search') {
      window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank');
      return;
    }

    setExplanation({ text, result: 'Thinking...', type });
    
    try {
      const result = type === 'definition' 
        ? await getWordDefinition(text)
        : await explainComplexText(text);
      setExplanation({ text, result, type });
    } catch (error) {
      setExplanation({ text, result: 'Failed to fetch information.', type });
    }
  };

  const handleSpeak = async () => {
    if (!transcription) return;
    
    if (isSpeakingRef.current) {
      stopSpeech();
      return;
    }

    setIsSpeaking(true);
    isSpeakingRef.current = true;
    
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      const base64Audio = await generateSpeech(transcription, selectedVoice);
      
      // Check if user stopped while fetching
      if (!isSpeakingRef.current) return;

      if (base64Audio) {
        const binary = atob(base64Audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        
        // Convert 16-bit PCM to Float32 with alignment fix
        const pcmData = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
        const floatData = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
          floatData[i] = pcmData[i] / 32768.0;
        }
        
        const buffer = audioCtxRef.current.createBuffer(1, floatData.length, 24000);
        buffer.getChannelData(0).set(floatData);
        
        const source = audioCtxRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtxRef.current.destination);
        source.start();
        audioSourceRef.current = source;
        source.onended = () => {
          setIsSpeaking(false);
          isSpeakingRef.current = false;
        };
      }
    } catch (error) {
      console.error("Speech generation failed:", error);
      setIsSpeaking(false);
      isSpeakingRef.current = false;
    }
  };

  const stopSpeech = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {}
      audioSourceRef.current = null;
    }
    setIsSpeaking(false);
    isSpeakingRef.current = false;
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white font-sans overflow-hidden flex flex-col">
      {/* Header */}
      <header className="p-4 flex justify-between items-center border-b border-white/10 bg-white/5 backdrop-blur-md z-50">
        <div className="flex items-center gap-3">
          <img src="/input_file_0.png" alt="VoxLoom Logo" className="h-10 w-auto" referrerPolicy="no-referrer" />
          <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400 hidden sm:block">
            VoxLoom
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/5 rounded-full px-3 py-1 border border-white/10">
            <Volume2 size={14} className="text-purple-400" />
            <select 
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="bg-transparent text-xs focus:outline-none cursor-pointer"
            >
              {VOICES.map(v => <option key={v} value={v} className="bg-[#1e293b]">{v}</option>)}
            </select>
          </div>
          <button 
            onClick={isRecording ? stopRecording : startRecording}
            className={cn(
              "p-2 rounded-full transition-all",
              isRecording ? "bg-red-500 animate-pulse" : "bg-white/5 hover:bg-white/10"
            )}
          >
            {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row gap-6 p-6 overflow-hidden relative">
        {/* Selection Menu */}
        <AnimatePresence>
          {selectionMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              style={{ left: selectionMenu.x, top: selectionMenu.y }}
              className="fixed -translate-x-1/2 -translate-y-full z-[100] flex gap-1 bg-[#1e293b] border border-purple-500/50 p-1 rounded-xl shadow-2xl backdrop-blur-xl"
            >
              <button 
                onClick={() => handleAction('definition')}
                className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-purple-500/20 rounded-lg text-xs font-medium transition-colors"
              >
                <Languages size={14} /> Define
              </button>
              <button 
                onClick={() => handleAction('explanation')}
                className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-pink-500/20 rounded-lg text-xs font-medium transition-colors"
              >
                <MessageSquareText size={14} /> Explain
              </button>
              <button 
                onClick={() => handleAction('search')}
                className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-blue-500/20 rounded-lg text-xs font-medium transition-colors"
              >
                <Search size={14} /> Search
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Left Window: Input/Preview */}
        <section className="flex-1 flex flex-col gap-4 min-h-[300px]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40 flex items-center gap-2">
              <Upload size={14} /> Source
            </h2>
            <div className="flex gap-2">
              <select 
                value={selectedAspectRatio}
                onChange={(e) => setSelectedAspectRatio(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-0.5 text-[10px] focus:outline-none"
              >
                {ASPECT_RATIOS.map(r => <option key={r} value={r} className="bg-[#1e293b]">{r}</option>)}
              </select>
              <button 
                onClick={handleGenerateCover}
                disabled={!transcription || isGeneratingImage}
                className="text-[10px] uppercase font-bold text-purple-400 hover:text-purple-300 disabled:opacity-30 flex items-center gap-1"
              >
                {isGeneratingImage ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                Cover
              </button>
            </div>
          </div>
          
          <div className="flex-1 bg-white/5 border border-white/10 rounded-3xl relative overflow-hidden group transition-all hover:border-purple-500/30">
            {!previewUrl && !generatedCover ? (
              <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer p-8 text-center">
                <img src="/input_file_1.png" alt="App Icon" className="w-24 h-24 mb-6 opacity-80 group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
                <span className="text-xl font-bold mb-2">Import your book</span>
                <span className="text-sm text-white/40">Upload a photo, PDF, or record your voice to begin</span>
                <input type="file" className="hidden" onChange={handleFileChange} accept="image/*,application/pdf" />
              </label>
            ) : (
              <div className="absolute inset-0 p-4">
                {generatedCover ? (
                  <img src={generatedCover} alt="Generated Cover" className="w-full h-full object-contain rounded-2xl" />
                ) : file?.type.includes('pdf') ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-white/5 rounded-2xl border border-white/10">
                    <FileText size={48} className="text-purple-400 mb-4" />
                    <span className="text-lg font-medium px-4 text-center truncate w-full">{file.name}</span>
                  </div>
                ) : (
                  <img src={previewUrl!} alt="Preview" className="w-full h-full object-contain rounded-2xl" />
                )}
              </div>
            )}
          </div>
          
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            disabled={!file || isAnalyzing}
            onClick={analyzeFile}
            className={cn(
              "w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all",
              file && !isAnalyzing ? "bg-gradient-to-r from-purple-600 to-pink-600 shadow-lg shadow-purple-500/20" : "bg-white/10 text-white/20 cursor-not-allowed"
            )}
          >
            {isAnalyzing ? <Loader2 className="animate-spin" /> : <Search size={20} />}
            {isAnalyzing ? "Processing..." : "Transcribe Content"}
          </motion.button>
        </section>

        {/* Right Window: Analyzed Text */}
        <section className="flex-1 flex flex-col gap-4 min-h-[300px]">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40 flex items-center gap-2">
            <FileText size={14} /> Transcription
          </h2>
          
          <div className="flex-1 bg-white/5 border border-white/10 rounded-3xl overflow-y-auto p-8 relative selection:bg-purple-500/30">
            {!transcription && !isAnalyzing && (
              <div className="h-full flex flex-col items-center justify-center text-white/10">
                <BookOpen size={64} className="mb-4" />
                <p className="text-center max-w-[200px]">Your transcribed text will appear here. Select text for definitions.</p>
              </div>
            )}
            
            {isAnalyzing && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-10 rounded-3xl">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                  <p className="text-purple-400 font-medium animate-pulse">Gemini is reading...</p>
                </div>
              </div>
            )}

            <div className="text-lg leading-relaxed text-white/90 whitespace-pre-wrap font-serif">
              {transcription}
            </div>
          </div>

          {/* Explanation/Definition Panel */}
          <AnimatePresence>
            {explanation && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-white/5 border border-purple-500/30 rounded-3xl p-6 shadow-2xl overflow-hidden"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] font-bold uppercase tracking-tighter rounded">
                      {explanation.type}
                    </span>
                    <h3 className="font-bold text-white text-lg truncate max-w-[200px]">"{explanation.text}"</h3>
                  </div>
                  <button onClick={() => setExplanation(null)} className="p-1 hover:bg-white/10 rounded-full">
                    <X size={18} />
                  </button>
                </div>
                <div className="text-sm text-white/70 leading-relaxed max-h-[150px] overflow-y-auto pr-2">
                  {explanation.result}
                </div>
                <div className="mt-4 flex justify-end">
                  <button 
                    onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(explanation.text)}`, '_blank')}
                    className="text-[10px] uppercase font-bold flex items-center gap-1 text-white/40 hover:text-white transition-colors"
                  >
                    Deep Search <ExternalLink size={10} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* Audio Controls Bar */}
      <footer className="p-6 bg-white/5 border-t border-white/10 backdrop-blur-2xl">
        <div className="max-w-5xl mx-auto flex items-center gap-8">
          <div className="flex-1 hidden md:block">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
              <span>Playback Engine</span>
              <span className={isSpeaking ? "text-green-400" : ""}>{isSpeaking ? 'Streaming' : 'Ready'}</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 bg-[length:200%_100%]"
                animate={{ 
                  width: isSpeaking ? '100%' : '0%',
                  backgroundPosition: ['0% 0%', '100% 0%']
                }}
                transition={{ 
                  width: { duration: 30, ease: "linear" },
                  backgroundPosition: { duration: 2, repeat: Infinity, ease: "linear" }
                }}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-6 mx-auto md:mx-0">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleSpeak}
              disabled={!transcription}
              className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all",
                transcription ? "bg-white text-black hover:shadow-purple-500/20" : "bg-white/5 text-white/10 cursor-not-allowed"
              )}
            >
              {isSpeaking ? <Pause fill="currentColor" size={28} /> : <Play fill="currentColor" size={28} className="ml-1" />}
            </motion.button>
            
            <button
              onClick={stopSpeech}
              disabled={!isSpeaking}
              className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:bg-white/10 disabled:opacity-20 transition-all"
            >
              <Square size={20} fill="currentColor" />
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-4 text-white/20">
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-tighter">Current Voice</div>
              <div className="text-xs text-white/60">{selectedVoice}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
              <Languages size={20} />
            </div>
          </div>
        </div>
      </footer>

      {/* Background Glows */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-600/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-pink-600/10 blur-[150px] rounded-full" />
      </div>
      <Analytics />
    </div>
  );
}
