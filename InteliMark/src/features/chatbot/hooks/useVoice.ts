import { useState, useEffect, useRef, useCallback } from 'react';

export const useVoice = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isStartingRef = useRef(false);

  useEffect(() => {
    console.log('🎬 [useVoice] Initializing');
    
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (SpeechRecognitionAPI) {
        console.log('✅ [useVoice] API found');
        setIsSupported(true);
        
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        
        recognition.onstart = () => {
          console.log('🎤 [onstart] Started');
          isStartingRef.current = false;
          setIsListening(true);
        };
        
        recognition.onresult = (event: any) => {
          console.log('📝 [onresult] Got result, event.results.length:', event.results.length);
          
          let interim = '';
          let final = '';
          
          for (let i = 0; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            console.log(`   [${i}] ${event.results[i].isFinal ? 'FINAL' : 'interim'}: "${transcript}"`);
            
            if (event.results[i].isFinal) {
              final += transcript + ' ';
            } else {
              interim += transcript;
            }
          }
          
          if (interim) {
            console.log('💬 Setting interim:', interim);
            setInterimTranscript(interim);
          }
          
          if (final) {
            console.log('✅ Setting final:', final);
            setTranscript(final.trim());
            setInterimTranscript('');
          }
        };
        
        recognition.onerror = (event: any) => {
          console.error('❌ [onerror]', event.error);
          isStartingRef.current = false;
          setError(event.error === 'no-speech' ? 'No speech detected' : 'Error: ' + event.error);
          setIsListening(false);
        };
        
        recognition.onend = () => {
          console.log('🛑 [onend] Ended');
          isStartingRef.current = false;
          setIsListening(false);
        };
        
        recognitionRef.current = recognition;
        console.log('✅ [useVoice] Setup complete');
      } else {
        console.log('❌ [useVoice] Not supported');
        setIsSupported(false);
      }
    }
    
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, []);

  const startListening = useCallback(() => {
    console.log('▶️ [startListening] Current state:', { isListening, isStarting: isStartingRef.current });
    
    if (!recognitionRef.current) {
      console.log('❌ No recognition ref');
      return;
    }

    if (isListening || isStartingRef.current) {
      console.log('⚠️ Already listening or starting, skipping start()');
      return;
    }
    
    try {
      isStartingRef.current = true;
      setTranscript('');
      setInterimTranscript('');
      setError(null);
      console.log('🚀 Calling recognition.start()...');
      recognitionRef.current.start();
      console.log('✅ recognition.start() called successfully (waiting for onstart event)');
    } catch (error: any) {
      console.error('❌ Start error:', error);
      isStartingRef.current = false;
      if (error.name !== 'InvalidStateError') {
        setError('Failed to start');
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    console.log('🛑 [stopListening]');
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.error('❌ Stop error:', error);
      }
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { 
    isListening, 
    transcript, 
    interimTranscript,
    error, 
    isSupported,
    startListening, 
    stopListening,
    clearTranscript,
    clearError
  };
};
