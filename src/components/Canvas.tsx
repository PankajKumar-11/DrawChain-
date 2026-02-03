import { useEffect, useRef, useState, useCallback } from 'react'
import type { Socket } from 'socket.io-client'

interface CanvasProps {
    socket: Socket | null
    roomId: string
    isAllowedToDraw: boolean
}

const COLORS = [
    '#000000', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF',
    '#FFA500', '#800080', '#008000', '#A52A2A',
    '#A0aec0', '#718096' // Grays
]

interface Point { x: number, y: number }
interface Stroke { type: 'stroke', points: Point[], color: string, width: number }
interface Fill { type: 'fill', x: number, y: number, color: string }
interface Clear { type: 'clear' }

type Action = Stroke | Fill | Clear

export function Canvas({ socket, roomId, isAllowedToDraw }: CanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null)

    // Tools
    const [color, setColor] = useState('#000000')
    const [tool, setTool] = useState<'pen' | 'eraser' | 'fill'>('pen')
    const [lineWidth, setLineWidth] = useState(2)

    // History
    const [history, setHistory] = useState<Action[]>([])
    const [redoStack, setRedoStack] = useState<Action[]>([])

    // Audio Refs
    const audioContextRef = useRef<AudioContext | null>(null)
    const gainNodeRef = useRef<GainNode | null>(null)
    const noiseBufferRef = useRef<AudioBuffer | null>(null)
    const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)

    // Current stroke accumulation
    const currentStroke = useRef<Point[]>([])

    // Remote stroke accumulation
    const remoteStroke = useRef<{ points: Point[], color: string, width: number } | null>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (context) {
            context.lineCap = 'round'
            context.lineJoin = 'round'
            context.strokeStyle = color
            context.lineWidth = lineWidth
            setCtx(context)

            // Allow transparent background if needed, but for fill tool white base is easier
            context.fillStyle = "white";
            context.fillRect(0, 0, canvas.width, canvas.height);
        }

        const AC = new (window.AudioContext || (window as any).webkitAudioContext)()
        audioContextRef.current = AC

        // Generate Noise Buffer (1 second is enough to loop)
        const bufferSize = AC.sampleRate * 2; // 2 seconds
        const buffer = AC.createBuffer(1, bufferSize, AC.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        noiseBufferRef.current = buffer

        return () => { audioContextRef.current?.close() }
    }, [])

    // Update context style when state changes
    useEffect(() => {
        if (!ctx) return
        ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : color
        ctx.lineWidth = tool === 'eraser' ? 20 : 2
    }, [color, tool, ctx])

    // --- Audio Logic ---
    // --- Audio Logic ---
    const startAudio = () => {
        if (!audioContextRef.current || !noiseBufferRef.current) return
        if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume()

        const ctx = audioContextRef.current

        // Source
        const source = ctx.createBufferSource()
        source.buffer = noiseBufferRef.current
        source.loop = true

        // Filter (Bandpass to mimic paper friction)
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 1000 // Center freq
        filter.Q.value = 1.5           // Width of band

        // Gain (Volume)
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0.02, ctx.currentTime) // Low volume start

        // Connect graph
        source.connect(filter)
        filter.connect(gain)
        gain.connect(ctx.destination)

        source.start()

        sourceNodeRef.current = source
        gainNodeRef.current = gain
    }

    const stopAudio = () => {
        if (sourceNodeRef.current) {
            sourceNodeRef.current.stop()
            sourceNodeRef.current.disconnect()
            sourceNodeRef.current = null
        }
        if (gainNodeRef.current) {
            gainNodeRef.current.disconnect()
            gainNodeRef.current = null
        }
    }

    // --- Drawing Logic ---

    // Execute an action on the canvas WITHOUT modifying state (for redraws)
    const executeAction = useCallback((action: Action, context: CanvasRenderingContext2D) => {
        if (action.type === 'clear') {
            context.fillStyle = "white";
            context.fillRect(0, 0, context.canvas.width, context.canvas.height);
        } else if (action.type === 'fill') {
            floodFill(context, action.x, action.y, action.color)
        } else if (action.type === 'stroke') {
            if (action.points.length === 0) return
            context.beginPath()
            context.strokeStyle = action.color
            context.lineWidth = action.width
            context.moveTo(action.points[0].x, action.points[0].y)
            for (let i = 1; i < action.points.length; i++) {
                context.lineTo(action.points[i].x, action.points[i].y)
            }
            context.stroke()
            context.closePath()
        }
    }, [])

    const redraw = useCallback(() => {
        if (!ctx || !canvasRef.current) return
        // Reset Canvas
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        // Replay history
        history.forEach(action => executeAction(action, ctx))

        // Restore current tool settings
        ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : color
        ctx.lineWidth = tool === 'eraser' ? 20 : 2
    }, [ctx, history, executeAction, tool, color])

    useEffect(() => {
        redraw()
    }, [history, redraw])

    // --- Interaction ---

    const getPoint = (e: React.MouseEvent | React.TouchEvent) => {
        if (!canvasRef.current) return { x: 0, y: 0 }
        const rect = canvasRef.current.getBoundingClientRect()
        const clientX = 'touches' in e ? e.touches[0].clientX : e.nativeEvent.clientX
        const clientY = 'touches' in e ? e.touches[0].clientY : e.nativeEvent.clientY
        const scaleX = canvasRef.current.width / rect.width
        const scaleY = canvasRef.current.height / rect.height
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        }
    }

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        if (!ctx || !isAllowedToDraw) return
        const { x, y } = getPoint(e)

        if (tool === 'fill') {
            // Fill implementation
            const action: Fill = { type: 'fill', x: Math.floor(x), y: Math.floor(y), color }
            setHistory(prev => [...prev, action])
            setRedoStack([]) // Clear redo
            socket?.emit('fill', { roomId, x: Math.floor(x), y: Math.floor(y), color })
            // Execute locally immediately
            floodFill(ctx, Math.floor(x), Math.floor(y), color)
            return
        }

        // Start Stroke
        setIsDrawing(true)
        currentStroke.current = [{ x, y }]

        ctx.beginPath()
        ctx.moveTo(x, y)
        startAudio()

        // Emit start
        socket?.emit('draw', {
            roomId,
            x, y,
            type: 'start',
            color: tool === 'eraser' ? '#FFFFFF' : color,
            width: tool === 'eraser' ? 20 : 2
        })
    }

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || !ctx || !isAllowedToDraw) return
        const { x, y } = getPoint(e)

        // Audio effect
        // Audio effect - Modulate volume slightly based on speed/movement?
        if (gainNodeRef.current && audioContextRef.current) {
            // Random small fluctuations to simulate paper texture
            const now = audioContextRef.current.currentTime
            gainNodeRef.current.gain.setValueAtTime(0.02 + Math.random() * 0.03, now)
        }

        // Local Draw
        ctx.lineTo(x, y)
        ctx.stroke()

        // Accumulate
        currentStroke.current.push({ x, y })

        // Emit
        socket?.emit('draw', {
            roomId,
            x, y,
            type: 'draw',
            color: tool === 'eraser' ? '#FFFFFF' : color
        })
    }

    const stopDrawing = () => {
        if (!isDrawing || !ctx) return

        ctx.closePath()
        setIsDrawing(false)
        stopAudio()

        // Commit to history
        if (currentStroke.current.length > 0) {
            const action: Stroke = {
                type: 'stroke',
                points: [...currentStroke.current],
                color: tool === 'eraser' ? '#FFFFFF' : color,
                width: tool === 'eraser' ? 20 : 2
            }
            setHistory(prev => [...prev, action])
            setRedoStack([])
            socket?.emit('end-draw', roomId)
        }
        currentStroke.current = []
    }

    const handleClear = () => {
        if (!isAllowedToDraw) return
        // Local
        const action: Clear = { type: 'clear' }
        setHistory(prev => [...prev, action])
        setRedoStack([])
        socket?.emit('clear', roomId)
        // Execute locally
        ctx!.fillStyle = "white";
        ctx!.fillRect(0, 0, ctx!.canvas.width, ctx!.canvas.height);
    }

    const handleUndo = () => {
        if (!isAllowedToDraw || history.length === 0) return
        const newHistory = [...history]
        const action = newHistory.pop()
        if (action) {
            setHistory(newHistory)
            setRedoStack(prev => [...prev, action])
            socket?.emit('undo', roomId)
        }
    }

    const handleRedo = () => {
        if (!isAllowedToDraw || redoStack.length === 0) return
        const newRedoStack = [...redoStack]
        const action = newRedoStack.pop()
        if (action) {
            setHistory(prev => [...prev, action])
            setRedoStack(newRedoStack)
            socket?.emit('redo', roomId)
        }
    }

    // --- Socket Listeners ---
    useEffect(() => {
        if (!socket || !ctx) return

        const onDraw = (data: { x: number, y: number, type: 'start' | 'draw', color: string, width?: number }) => {
            const drawWidth = data.width || (data.color === '#FFFFFF' ? 20 : 2)

            ctx.strokeStyle = data.color
            ctx.lineWidth = drawWidth

            if (data.type === 'start') {
                ctx.beginPath()
                ctx.moveTo(data.x, data.y)
                remoteStroke.current = {
                    points: [{ x: data.x, y: data.y }],
                    color: data.color,
                    width: drawWidth
                }
            } else {
                ctx.lineTo(data.x, data.y)
                ctx.stroke()
                if (remoteStroke.current) {
                    remoteStroke.current.points.push({ x: data.x, y: data.y })
                }
            }
        }

        const onEndDraw = () => {
            if (remoteStroke.current) {
                const action: Stroke = {
                    type: 'stroke',
                    points: remoteStroke.current.points,
                    color: remoteStroke.current.color,
                    width: remoteStroke.current.width
                }
                setHistory(prev => [...prev, action])
                remoteStroke.current = null
                ctx.closePath()
            }
        }

        const onFill = (data: { x: number, y: number, color: string }) => {
            const action: Fill = { type: 'fill', x: data.x, y: data.y, color: data.color }
            setHistory(prev => [...prev, action])
            // Execute locally as well to be sure
            floodFill(ctx, data.x, data.y, data.color)
        }

        const onClear = () => {
            const action: Clear = { type: 'clear' }
            setHistory(prev => [...prev, action])
            // Execute locally
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        }

        const onUndo = () => {
            setHistory(prev => {
                const newH = [...prev]
                const action = newH.pop()
                if (action) setRedoStack(s => [...s, action])
                return newH
            })
        }

        const onRedo = () => {
            setRedoStack(prev => {
                const newS = [...prev]
                const action = newS.pop()
                if (action) setHistory(h => [...h, action])
                return newS
            })
        }

        // Clean listeners to avoid dupes if re-mounting
        socket.off('draw')
        socket.off('fill')
        socket.off('clear')
        socket.off('end-draw')
        socket.off('undo')
        socket.off('redo')

        socket.on('draw', onDraw)
        socket.on('fill', onFill)
        socket.on('clear', onClear)
        socket.on('end-draw', onEndDraw)
        socket.on('undo', onUndo)
        socket.on('redo', onRedo)

        return () => {
            socket.off('draw')
            socket.off('fill')
            socket.off('clear')
            socket.off('end-draw')
            socket.off('undo')
            socket.off('redo')
        }
    }, [socket, ctx])


    // --- Helpers ---
    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    function floodFill(ctx: CanvasRenderingContext2D, startX: number, startY: number, fillColorStr: string) {
        const canvas = ctx.canvas
        const width = canvas.width
        const height = canvas.height
        const imageData = ctx.getImageData(0, 0, width, height)
        const data = imageData.data

        const fillColor = hexToRgb(fillColorStr)
        const startPos = (startY * width + startX) * 4
        const targetColor = {
            r: data[startPos],
            g: data[startPos + 1],
            b: data[startPos + 2],
            a: data[startPos + 3]
        }

        // Optimization: if transparent, assume white? or just handle alpha.
        // For now simple reliable equality check

        if (targetColor.r === fillColor.r && targetColor.g === fillColor.g && targetColor.b === fillColor.b) return

        const stack = [[startX, startY]]

        const match = (pos: number) => {
            return data[pos] === targetColor.r &&
                data[pos + 1] === targetColor.g &&
                data[pos + 2] === targetColor.b
        }

        const colorPixel = (pos: number) => {
            data[pos] = fillColor.r;
            data[pos + 1] = fillColor.g;
            data[pos + 2] = fillColor.b;
            data[pos + 3] = 255;
        }

        while (stack.length) {
            let [x, y] = stack.pop()!
            let pixelPos = (y * width + x) * 4

            while (y >= 0 && match(pixelPos)) {
                y--
                pixelPos -= width * 4
            }
            pixelPos += width * 4
            y++

            let reachLeft = false
            let reachRight = false

            while (y < height && match(pixelPos)) {
                colorPixel(pixelPos)

                if (x > 0) {
                    if (match(pixelPos - 4)) {
                        if (!reachLeft) {
                            stack.push([x - 1, y])
                            reachLeft = true
                        }
                    } else if (reachLeft) {
                        reachLeft = false
                    }
                }

                if (x < width - 1) {
                    if (match(pixelPos + 4)) {
                        if (!reachRight) {
                            stack.push([x + 1, y])
                            reachRight = true
                        }
                    } else if (reachRight) {
                        reachRight = false
                    }
                }

                y++
                pixelPos += width * 4
            }
        }
        ctx.putImageData(imageData, 0, 0)
    }

    return (
        <div className="flex flex-col items-center gap-2 w-full">
            <div className="relative w-full max-w-[500px]">
                <canvas
                    ref={canvasRef}
                    width={500}
                    height={500}
                    className={`sketch-border bg-white cursor-crosshair touch-none w-full h-auto aspect-square ${!isAllowedToDraw ? 'pointer-events-none opacity-90' : ''}`}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                />
                {!isAllowedToDraw && (
                    <div className="absolute top-2 right-2 text-xs bg-black/50 text-white px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
                        View Only
                    </div>
                )}
            </div>

            {/* Toolbar - Responsive Layout */}
            <div className={`flex flex-col md:flex-row gap-2 w-full items-center bg-white rounded-xl p-1 md:p-2 border-2 border-gray-200 shadow-sm ${!isAllowedToDraw ? 'pointer-events-none opacity-50 grayscale' : ''}`}>

                <div className="flex w-full md:w-auto justify-between md:justify-start gap-2">
                    {/* Tools Group */}
                    <div className="flex gap-1 items-center bg-gray-50 p-1 rounded-lg border border-gray-100 flex-1 md:flex-none justify-center">
                        <button
                            onClick={() => setTool('pen')}
                            className={`p-1.5 md:p-2 rounded-lg transition-all ${tool === 'pen' ? 'bg-blue-100 text-blue-600 shadow-inner' : 'hover:bg-gray-200 text-gray-500'}`}
                            title="Pencil"
                        >
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button
                            onClick={() => setTool('eraser')}
                            className={`p-1.5 md:p-2 rounded-lg transition-all ${tool === 'eraser' ? 'bg-blue-100 text-blue-600 shadow-inner' : 'hover:bg-gray-200 text-gray-500'}`}
                            title="Eraser"
                        >
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        </button>
                        <button
                            onClick={() => setTool('fill')}
                            className={`p-1.5 md:p-2 rounded-lg transition-all ${tool === 'fill' ? 'bg-blue-100 text-blue-600 shadow-inner' : 'hover:bg-gray-200 text-gray-500'}`}
                            title="Fill Bucket"
                        >
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                        </button>
                    </div>

                    <div className="w-[1px] h-auto bg-gray-200 hidden md:block"></div>

                    {/* Actions Group */}
                    <div className="flex gap-1 items-center bg-gray-50 p-1 rounded-lg border border-gray-100 flex-1 md:flex-none justify-center">
                        <button
                            onClick={handleUndo}
                            disabled={history.length === 0}
                            className="p-1.5 md:p-2 rounded-lg text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            title="Undo"
                        >
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                        </button>
                        <button
                            onClick={handleRedo}
                            disabled={redoStack.length === 0}
                            className="p-1.5 md:p-2 rounded-lg text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            title="Redo"
                        >
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                        </button>
                        <button
                            onClick={handleClear}
                            className="p-1.5 md:p-2 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors ml-1"
                            title="Clear All"
                        >
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                </div>

                <div className="w-full h-[1px] bg-gray-200 md:hidden"></div>
                <div className="w-[1px] h-8 bg-gray-200 hidden md:block"></div>

                {/* Color Swatches */}
                <div className="w-full md:flex-1 flex gap-1.5 overflow-x-auto no-scrollbar items-center justify-start md:justify-end py-1 px-1">
                    {COLORS.map(c => (
                        <button
                            key={c}
                            onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }}
                            style={{ backgroundColor: c }}
                            className={`w-6 h-6 md:w-7 md:h-7 rounded-full shrink-0 transition-transform shadow-sm border border-black/10 ${color === c && tool !== 'eraser' ? 'scale-125 ring-2 ring-blue-500 ring-offset-1' : 'hover:scale-110'}`}
                            aria-label={`Color ${c}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
