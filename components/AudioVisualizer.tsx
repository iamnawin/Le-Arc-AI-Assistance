
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyzer?: AnalyserNode;
  active: boolean;
  isThinking?: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ analyzer, active, isThinking }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const wavesRef = useRef<{ phase: number, color: string, amplitude: number, speed: number }[]>([]);

  useEffect(() => {
    // Standard sleek multi-wave setup
    wavesRef.current = [
      { phase: 0, color: 'rgba(34, 211, 238, 0.4)', amplitude: 20, speed: 0.08 },
      { phase: 1.2, color: 'rgba(255, 255, 255, 0.3)', amplitude: 15, speed: 0.06 },
      { phase: 2.5, color: 'rgba(6, 182, 212, 0.2)', amplitude: 25, speed: 0.1 },
    ];
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyzer?.frequencyBinCount || 0;
    const dataArray = new Uint8Array(bufferLength);

    const draw = (time: number) => {
      requestRef.current = requestAnimationFrame(draw);
      
      // Update data
      let intensity = 0;
      if (analyzer && active) {
        analyzer.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        intensity = Math.min(sum / (bufferLength * 1.5), 1.0);
      }

      // Clear for full transparency on pure black
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      // Draw horizontal waves
      wavesRef.current.forEach((wave, i) => {
        ctx.beginPath();
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = 1.5;
        
        // Intensity drives wave height
        const currentAmplitude = (wave.amplitude + (intensity * 150)) * (active ? 1 : 0.05);
        
        for (let x = 0; x <= width; x += 5) {
          // Centered horizontal wave
          const normalization = 1 - Math.pow((x - width / 2) / (width / 2), 2); // Taper ends
          const y = centerY + Math.sin(x * 0.01 + wave.phase + (time * 0.005 * wave.speed)) * currentAmplitude * normalization;
          
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        
        ctx.stroke();
        wave.phase += wave.speed * (1 + intensity * 2);

        // Core glow for the active wave
        if (active && intensity > 0.2) {
          ctx.shadowBlur = 10 * intensity;
          ctx.shadowColor = 'rgba(34, 211, 238, 0.8)';
        }
      });

      // Add architectural "nodes" if active
      if (active && intensity > 0.5) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(width/2, centerY, 3 + intensity * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    draw(0);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [analyzer, active, isThinking]);

  return (
    <div className="w-full h-full flex items-center justify-center pointer-events-none bg-transparent overflow-hidden">
      <canvas 
        ref={canvasRef} 
        width={1200} 
        height={400} 
        className="w-full max-w-full h-auto block opacity-80"
      />
      {!active && !isThinking && (
        <div className="absolute inset-0 flex items-center justify-center opacity-10">
          <div className="w-1/2 h-[1px] bg-white animate-pulse" />
        </div>
      )}
    </div>
  );
};

export default AudioVisualizer;
