import { useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'

interface CanvasProps {
    socket: Socket | null
    roomId: string
}

const COLORS = [
    '#000000', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF',
    '#FFA500', '#800080', '#008000', '#A52A2A'
]

export function Canvas({ socket, roomId }: CanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null)
    const [color, setColor] = useState('#000000')
    const [tool, setTool] = useState<'pen' | 'fill'>('pen')
    const audioContextRef = useRef<AudioContext | null>(null)
    const oscillatorRef = useRef<OscillatorNode | null>(null)
    const gainNodeRef = useRef<GainNode | null>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        // Fix: Add willReadFrequently for optimized readback operations
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (context) {
            context.lineCap = 'round'
            context.strokeStyle = color
            context.lineWidth = 2
            setCtx(context)
            context.fillStyle = "white";
            context.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Init Audio
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()

        return () => {
            audioContextRef.current?.close()
        }
    }, [])

    // Update stroke color when state changes
    useEffect(() => {
        if (ctx) ctx.strokeStyle = color
    }, [color, ctx])

    const startAudio = () => {
        if (!audioContextRef.current) return
        if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume()
        }

        const osc = audioContextRef.current.createOscillator()
        const gain = audioContextRef.current.createGain()

        osc.type = 'sawtooth' // Rougher, more pencil-like
        osc.frequency.setValueAtTime(300, audioContextRef.current.currentTime) // Lower base

        // Add noise/variation
        osc.frequency.linearRampToValueAtTime(500, audioContextRef.current.currentTime + 0.1)

        gain.gain.setValueAtTime(0.1, audioContextRef.current.currentTime)

        osc.connect(gain)
        gain.connect(audioContextRef.current.destination)
        osc.start()

        oscillatorRef.current = osc
        gainNodeRef.current = gain
    }

    const stopAudio = () => {
        if (oscillatorRef.current) {
            oscillatorRef.current.stop()
            oscillatorRef.current.disconnect()
            oscillatorRef.current = null
        }
        if (gainNodeRef.current) {
            gainNodeRef.current.disconnect()
            gainNodeRef.current = null
        }
    }

    useEffect(() => {
        if (!socket || !ctx) return

        socket.on('draw', (data: { x: number, y: number, type: 'start' | 'draw', color: string }) => {
            ctx.strokeStyle = data.color
            if (data.type === 'start') {
                ctx.beginPath()
                ctx.moveTo(data.x, data.y)
            } else {
                ctx.lineTo(data.x, data.y)
                ctx.stroke()
            }
            ctx.strokeStyle = color // Revert to local color
        })

        socket.on('fill', (data: { x: number, y: number, color: string }) => {
            floodFill(data.x, data.y, data.color)
        })

        socket.on('clear', () => {
            if (!canvasRef.current) return
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        })

        return () => {
            socket.off('draw')
            socket.off('fill')
            socket.off('clear')
        }
    }, [socket, ctx, color])

    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    const floodFill = (startX: number, startY: number, fillColorStr: string) => {
        if (!ctx || !canvasRef.current) return

        const canvas = canvasRef.current
        const width = canvas.width
        const height = canvas.height
        const imageData = ctx.getImageData(0, 0, width, height)
        const data = imageData.data

        const fillColor = hexToRgb(fillColorStr)
        const targetColor = {
            r: data[((startY * width + startX) * 4)],
            g: data[((startY * width + startX) * 4) + 1],
            b: data[((startY * width + startX) * 4) + 2],
            a: data[((startY * width + startX) * 4) + 3] // Alpha
        }

        // Don't fill if same color
        if (targetColor.r === fillColor.r && targetColor.g === fillColor.g && targetColor.b === fillColor.b) return

        const stack = [[startX, startY]]

        while (stack.length) {
            let [x, y] = stack.pop()!
            let pixelPos = (y * width + x) * 4

            // Check bounds and color match
            while (y >= 0 && matchStartColor(pixelPos)) {
                y--
                pixelPos -= width * 4
            }

            pixelPos += width * 4
            y++

            let reachLeft = false
            let reachRight = false

            while (y < height && matchStartColor(pixelPos)) {
                colorPixel(pixelPos)

                if (x > 0) {
                    if (matchStartColor(pixelPos - 4)) {
                        if (!reachLeft) {
                            stack.push([x - 1, y])
                            reachLeft = true
                        }
                    } else if (reachLeft) {
                        reachLeft = false
                    }
                }

                if (x < width - 1) {
                    if (matchStartColor(pixelPos + 4)) {
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

        function matchStartColor(pos: number) {
            return data[pos] === targetColor.r &&
                data[pos + 1] === targetColor.g &&
                data[pos + 2] === targetColor.b
        }

        function colorPixel(pos: number) {
            data[pos] = fillColor.r;
            data[pos + 1] = fillColor.g;
            data[pos + 2] = fillColor.b;
            data[pos + 3] = 255;
        }
    }

    const getPoint = (e: React.MouseEvent | React.TouchEvent) => {
        if (!canvasRef.current) return { x: 0, y: 0 }
        const canvas = canvasRef.current
        const rect = canvas.getBoundingClientRect()

        let clientX, clientY
        if ('touches' in e) {
            clientX = e.touches[0].clientX
            clientY = e.touches[0].clientY
        } else {
            clientX = e.nativeEvent.clientX
            clientY = e.nativeEvent.clientY
        }

        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        }
    }

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        if (!ctx) return
        // Prevent scrolling on touch
        if ('touches' in e) {
            // e.preventDefault() // React synthetic event doesn't support passive preventDefault directly in some cases, but touch-action: none handles it.
        }

        const { x, y } = getPoint(e)

        if (tool === 'fill') {
            floodFill(Math.floor(x), Math.floor(y), color)
            socket?.emit('fill', { roomId, x: Math.floor(x), y: Math.floor(y), color })
            return
        }

        ctx.beginPath()
        ctx.moveTo(x, y)
        setIsDrawing(true)
        startAudio()
        socket?.emit('draw', { roomId, x, y, type: 'start', color })
    }

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || !ctx) return
        const { x, y } = getPoint(e)

        // Random pitch flutter for realism
        if (oscillatorRef.current && audioContextRef.current) {
            oscillatorRef.current.frequency.setValueAtTime(
                400 + Math.random() * 200,
                audioContextRef.current.currentTime
            )
        }

        ctx.lineTo(x, y)
        ctx.stroke()
        socket?.emit('draw', { roomId, x, y, type: 'draw', color })
    }

    const stopDrawing = () => {
        if (!ctx) return
        if (isDrawing) {
            ctx.closePath()
            setIsDrawing(false)
            stopAudio()
        }
    }

    const clearCanvas = () => {
        if (!ctx || !canvasRef.current) return
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        socket?.emit('clear', roomId)
    }

    return (
        <div className="flex flex-col items-center gap-2 w-full">
            <canvas
                ref={canvasRef}
                width={500}
                height={500}
                className="sketch-border bg-white cursor-crosshair touch-none w-full h-auto aspect-square max-w-[500px]"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
            />

            {/* Compact Toolbar */}
            <div className="flex gap-1 w-full justify-between px-1 items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
                {/* Color Swatches */}
                <div className="flex gap-1 overflow-x-auto max-w-[50%] no-scrollbar items-center px-1">
                    {COLORS.map(c => (
                        <button
                            key={c}
                            onClick={() => setColor(c)}
                            style={{ backgroundColor: c }}
                            className={`w-6 h-6 rounded-full border border-gray-300 shrink-0 transition-transform ${color === c ? 'scale-125 ring-2 ring-black border-transparent' : 'hover:scale-110'}`}
                            aria-label={`Color ${c}`}
                        />
                    ))}
                    <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="w-6 h-6 border-none bg-transparent p-0 rounded-full shrink-0"
                    />
                </div>

                <div className="w-[1px] h-6 bg-gray-300 mx-1"></div>

                {/* Tools */}
                <div className="flex gap-1 items-center">
                    <button
                        onClick={() => setTool('pen')}
                        className={`p-1 rounded-md transition-all ${tool === 'pen' ? 'bg-blue-200 text-blue-800' : 'hover:bg-gray-200 text-gray-600'}`}
                        title="Pencil"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                    <button
                        onClick={() => setTool('fill')}
                        className={`p-1 rounded-md transition-all ${tool === 'fill' ? 'bg-blue-200 text-blue-800' : 'hover:bg-gray-200 text-gray-600'}`}
                        title="Fill Bucket"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                    </button>
                    <button
                        onClick={clearCanvas}
                        className="p-1 rounded-md text-red-500 hover:bg-red-50 ml-1"
                        title="Clear Canvas"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </div>
        </div>
    )
}
