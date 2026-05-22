import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, Upload, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion';
import { supabase } from '../lib/supabase';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  timestamp: Date;
}

interface ChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Chat({ isOpen, onClose }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  // Load chat history from Supabase
  useEffect(() => {
    loadChatHistory();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('chat-messages')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages' }, 
        (payload) => {
          const newMsg = payload.new as any;
          setMessages(prev => [...prev, {
            id: newMsg.id,
            role: newMsg.role,
            content: newMsg.content,
            timestamp: new Date(newMsg.created_at)
          }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadChatHistory = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) console.error(error);
    else {
      setMessages(data.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.created_at)
      })));
    }
  };

  const sendMessage = async () => {
    if (!input.trim() && !isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Save to Supabase
    await supabase.from('messages').insert({
      role: 'user',
      content: input
    });

    // Call Grok API (existing logic)
    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_GROK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'grok-3',
          messages: [{ role: 'user', content: input }],
          stream: false
        })
      });

      const data = await response.json();
      const aiReply = data.choices[0].message.content;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiReply,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      await supabase.from('messages').insert({
        role: 'assistant',
        content: aiReply
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="fixed bottom-24 right-8 w-96 h-[600px] bg-[#1A1A1A]/95 backdrop-blur-2xl border border-white/10 rounded-3xl flex flex-col overflow-hidden z-50"
        >
          {/* Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
                🌱
              </div>
              <div>
                <p className="font-medium">Lok AI</p>
                <p className="text-xs text-emerald-400">Agriculture Assistant</p>
              </div>
            </div>
            <button onClick={onClose}><X size={20} /></button>
          </div>

          {/* Messages */}
          <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-2xl ${msg.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-white/10'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && <div className="text-white/50">Lok is thinking...</div>}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-white/10">
            <div className="flex gap-2">
              <button className="p-3"><Mic /></button>
              <button className="p-3"><Upload /></button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                className="flex-1 bg-white/10 rounded-full px-5 py-3 text-sm focus:outline-none"
                placeholder="Ask about your farm..."
              />
              <button onClick={sendMessage} className="p-3 bg-emerald-600 rounded-full"><Send /></button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
