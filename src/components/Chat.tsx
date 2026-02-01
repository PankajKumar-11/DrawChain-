import { useState, useEffect } from 'react'
import type { Socket } from 'socket.io-client'

interface ChatProps {
    socket: Socket | null
    roomId: string
    username: string
    isDrawer: boolean
    isDrawing: boolean
}

interface Message {
    user: string
    text: string
    timestamp: number
}

export function Chat({ socket, roomId, username, isDrawer, isDrawing }: ChatProps) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')

    useEffect(() => {
        if (!socket) return

        const handleChat = (msg: Message) => setMessages((prev) => [...prev, msg])

        const handleSystem = (text: string) => {
            setMessages((prev) => [...prev, { user: '📢', text, timestamp: Date.now() }])
        }

        socket.on('chat-message', handleChat)
        socket.on('system-message', handleSystem)

        return () => {
            socket.off('chat-message', handleChat)
            socket.off('system-message', handleSystem)
        }
    }, [socket])

    const sendMessage = (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || !socket) return

        const msg = { user: username, text: input, timestamp: Date.now() }
        socket.emit('chat-message', { roomId, ...msg })
        setInput('')
    }

    return (
        <div className="flex flex-col h-full w-full min-h-0">
            <div className="flex-1 overflow-y-auto p-1 space-y-1 font-hand min-h-0 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                {messages.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.user === username ? 'items-end' : 'items-start'}`}>
                        {m.user !== '📢' && <span className="text-[8px] text-gray-400 mb-0.5">{m.user}</span>}
                        <div className={`px-2 py-1 rounded-lg max-w-[95%] text-[10px] break-words relative shadow-sm border 
                            ${m.user === '📢'
                                ? 'bg-yellow-50 text-center w-full italic font-bold text-gray-600 border-yellow-100'
                                : m.user === username
                                    ? 'bg-blue-50 border-blue-100 rounded-br-none'
                                    : 'bg-gray-50 border-gray-100 rounded-bl-none'
                            }`}>
                            {m.text}
                        </div>
                    </div>
                ))}
            </div>

            <form onSubmit={sendMessage} className="p-1 pt-1 flex items-center gap-1 border-t border-gray-100 mt-auto">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-1 border-b border-gray-300 bg-transparent px-1 py-0.5 text-xs text-black font-hand focus:outline-none focus:border-blue-500 disabled:opacity-50"
                    placeholder={isDrawing && isDrawer ? "Drawing..." : "Guess..."}
                    disabled={isDrawing && isDrawer}
                />
                <button
                    type="submit"
                    className="bg-blue-500 text-white px-2 py-0.5 rounded text-[10px] sketch-border hover:bg-blue-600 font-bold disabled:opacity-50"
                    disabled={isDrawing && isDrawer}
                >
                    Send
                </button>
            </form>
        </div>
    )
}
