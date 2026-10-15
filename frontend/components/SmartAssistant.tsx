import React, { useState, useRef, useEffect } from 'react';
import { ParetoSolution } from '../types';
import { GoogleGenAI } from "@google/genai";
import { SparklesIcon } from './icons';

interface SmartAssistantProps {
  solution: ParetoSolution;
  onClose: () => void;
}

interface ChatMessage {
    sender: 'user' | 'ai';
    text: string;
}

const SmartAssistant: React.FC<SmartAssistantProps> = ({ solution, onClose }) => {
    const [history, setHistory] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [history]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: ChatMessage = { sender: 'user', text: input };
        setHistory(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            
            const prompt = `Eres un analista de logística experto en transporte eléctrico. Tu tarea es analizar la solución de enrutamiento de vehículos proporcionada y responder la pregunta del usuario. Sé conciso, útil y usa un tono amigable. Basa tu respuesta estrictamente en los datos proporcionados.

            Aquí están los datos de la solución de optimización en formato JSON:
            ${JSON.stringify(solution, null, 2)}

            Aquí está la pregunta del usuario:
            "${input}"`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            const aiMessage: ChatMessage = { sender: 'ai', text: response.text };
            setHistory(prev => [...prev, aiMessage]);

        } catch (error) {
            console.error("La llamada a la API de Gemini falló:", error);
            const errorMessage: ChatMessage = { sender: 'ai', text: "Lo siento, no pude conectarme al servicio de IA. Por favor, revisa tu clave de API y tu conexión de red." };
            setHistory(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="mt-4 p-4 border border-sky-200 bg-sky-50 rounded-lg animate-fade-in">
            <div className="flex items-center mb-3">
                <SparklesIcon className="h-6 w-6 text-accent mr-2"/>
                <h4 className="font-semibold text-lg text-text-main">Asistente Inteligente</h4>
            </div>
            <div ref={chatContainerRef} className="h-48 overflow-y-auto bg-white border rounded-md p-3 space-y-3 mb-3">
                {history.length === 0 && (
                    <div className="text-center text-sm text-gray-400 h-full flex items-center justify-center">
                        Haz una pregunta sobre la solución, ej., "¿Qué vehículo viaja más lejos?"
                    </div>
                )}
                {history.map((msg, index) => (
                    <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg ${msg.sender === 'user' ? 'bg-primary text-white' : 'bg-gray-200 text-text-main'}`}>
                           <p className="text-sm">{msg.text}</p>
                        </div>
                    </div>
                ))}
                 {isLoading && (
                    <div className="flex justify-start">
                        <div className="max-w-xs lg:max-w-md px-3 py-2 rounded-lg bg-gray-200 text-text-main">
                           <div className="flex items-center">
                               <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce mr-1"></div>
                               <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-75 mr-1"></div>
                               <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-150"></div>
                           </div>
                        </div>
                    </div>
                )}
            </div>
            <div className="flex space-x-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Haz una pregunta..."
                    className="flex-grow block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                    disabled={isLoading}
                />
                <button
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                    Enviar
                </button>
            </div>
        </div>
    );
};

export default SmartAssistant;