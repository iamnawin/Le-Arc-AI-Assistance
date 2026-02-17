
export interface TranscriptionEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export interface AudioVisualizerProps {
  isListening: boolean;
  analyzer?: AnalyserNode;
}
