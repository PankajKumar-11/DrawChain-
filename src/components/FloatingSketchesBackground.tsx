import { useEffect, useRef } from 'react'

const ICONS = ['✏️', '🖌️', '🎨', '🖍️', '📐', '📏', '📎', '📌', '🧊', '📜']

interface Particle {
    x: number
    y: number
    z: number
    vx: number
    vy: number
    vz: number
    icon: string
    scale: number
}

export default function FloatingSketchesBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const particles = useRef<Particle[]>([])
    const mouse = useRef({ x: 0, y: 0 })
    const isMouseMoving = useRef(false)
    const mouseTimeout = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        let animationFrameId: number
        let width = window.innerWidth
        let height = window.innerHeight

        const init = () => {
            canvas.width = width
            canvas.height = height
            particles.current = []

            // Create particles
            const count = Math.min(60, (width * height) / 15000) // Lower density

            for (let i = 0; i < count; i++) {
                particles.current.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    z: Math.random() * 2 + 0.5, // Depth
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    vz: 0,
                    icon: ICONS[Math.floor(Math.random() * ICONS.length)],
                    scale: Math.random() * 0.5 + 0.5
                })
            }
        }

        const animate = () => {
            ctx.clearRect(0, 0, width, height)

            // Paper texture overlay effect (subtle)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
            ctx.fillRect(0, 0, width, height)

            particles.current.forEach(p => {
                // Basic movement
                p.x += p.vx * p.z
                p.y += p.vy * p.z

                // Wrap around
                if (p.x < -50) p.x = width + 50
                if (p.x > width + 50) p.x = -50
                if (p.y < -50) p.y = height + 50
                if (p.y > height + 50) p.y = -50

                // Mouse interaction (Blast effect)
                if (isMouseMoving.current) {
                    const dx = p.x - mouse.current.x
                    const dy = p.y - mouse.current.y
                    const dist = Math.sqrt(dx * dx + dy * dy)
                    const blastRadius = 200

                    if (dist < blastRadius) {
                        const angle = Math.atan2(dy, dx)
                        const force = (blastRadius - dist) / blastRadius
                        const blastStrength = 15 * force

                        p.vx += Math.cos(angle) * blastStrength * 0.05
                        p.vy += Math.sin(angle) * blastStrength * 0.05
                    }
                }

                // Friction / Return to normal speed
                p.vx *= 0.98
                p.vy *= 0.98

                // Min speed maintain
                if (Math.abs(p.vx) < 0.2) p.vx += (Math.random() - 0.5) * 0.05
                if (Math.abs(p.vy) < 0.2) p.vy += (Math.random() - 0.5) * 0.05

                // Draw
                const size = 30 * p.scale * p.z
                ctx.font = `${size}px "Comic Sans MS"`

                // Removed shadow draw call for performance
                ctx.globalAlpha = 0.8 * (p.z / 2.5)
                ctx.fillStyle = `rgba(0, 0, 0, ${0.8})`
                ctx.fillText(p.icon, p.x, p.y)
                ctx.globalAlpha = 1
            })

            animationFrameId = requestAnimationFrame(animate)
        }

        const handleResize = () => {
            width = window.innerWidth
            height = window.innerHeight
            init()
        }

        const handleMouseMove = (e: MouseEvent) => {
            mouse.current = { x: e.clientX, y: e.clientY }
            isMouseMoving.current = true

            if (mouseTimeout.current) clearTimeout(mouseTimeout.current)
            mouseTimeout.current = setTimeout(() => {
                isMouseMoving.current = false
            }, 100)
        }

        window.addEventListener('resize', handleResize)
        window.addEventListener('mousemove', handleMouseMove)

        init()
        animate()

        return () => {
            window.removeEventListener('resize', handleResize)
            window.removeEventListener('mousemove', handleMouseMove)
            cancelAnimationFrame(animationFrameId)
        }
    }, [])

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 w-full h-full pointer-events-none -z-10 bg-gray-50"
        />
    )
}
