import { Server, Socket } from 'socket.io'
import { WORDS } from '@/lib/words'

interface Player {
    id: string
    name: string
    avatar: string
    score: number
    guessed: boolean
    disconnected?: boolean
    disconnectTimeout?: NodeJS.Timeout
}


interface Game {
    roomId: string
    status: 'LOBBY' | 'SELECTING' | 'DRAWING' | 'ENDED'
    players: Player[]
    drawerIndex: number
    currentWord: string
    wordOptions: string[]
    maxRounds: number
    currentRound: number
    drawTime: number
    timeLeft: number
    timer: NodeJS.Timeout | null
    hostId: string
}

const games: Record<string, Game> = (global as any).games || {}
    ; (global as any).games = games

// Helper to clean game state for public consumption (hiding words)
const getPublicState = (game: Game, playerId: string) => {
    return {
        ...game,
        currentWord: (game.status === 'DRAWING' && playerId !== game.players[game.drawerIndex]?.id && !game.players.find(p => p.id === playerId)?.guessed)
            ? game.currentWord.replace(/./g, '_ ')
            : game.currentWord,
        wordOptions: (game.status === 'SELECTING' && playerId !== game.players[game.drawerIndex]?.id)
            ? []
            : game.wordOptions,
        timer: undefined // Don't send timeout obj
    }
}

const get3Words = () => {
    // Pick 3 unique random indexes
    const indices = new Set<number>()
    while (indices.size < 3 && indices.size < WORDS.length) {
        indices.add(Math.floor(Math.random() * WORDS.length))
    }
    return Array.from(indices).map(i => WORDS[i])
}




const nextTurn = (io: Server, roomId: string) => {
    const game = games[roomId]
    if (!game) return

    if (game.timer) clearInterval(game.timer)

    // Clear canvas
    io.to(roomId).emit('clear')

    game.drawerIndex++
    if (game.drawerIndex >= game.players.length) {
        game.drawerIndex = 0
        game.currentRound++
    }

    if (game.currentRound > game.maxRounds) {
        game.status = 'ENDED'
        // FIX: Ensure clients receive the ended state immediately
        game.players.forEach(p => {
            io.to(p.id).emit('game-update', getPublicState(game, p.id))
        })
        io.to(roomId).emit('game-ended', game.players)
        return
    }

    // Set SELECTING state
    game.status = 'SELECTING'
    game.wordOptions = get3Words()
    game.currentWord = ''
    game.timeLeft = 15 // 15s to select
    game.players.forEach(p => p.guessed = false)

    const drawer = game.players[game.drawerIndex]

    // Broadcast update
    game.players.forEach(p => {
        io.to(p.id).emit('game-update', getPublicState(game, p.id))
    })

    // Timer for selection
    game.timer = setInterval(() => {
        game.timeLeft--
        if (game.timeLeft <= 0) {
            // Auto select first word
            startRound(io, roomId, game.wordOptions[0])
        } else {
            io.to(roomId).emit('timer-update', game.timeLeft)
        }
    }, 1000)
}


const startRound = (io: Server, roomId: string, word: string) => {
    const game = games[roomId]
    if (!game) return
    if (game.timer) clearInterval(game.timer)

    game.status = 'DRAWING'
    game.currentWord = word
    game.wordOptions = []
    game.timeLeft = game.drawTime

    // Broadcast update
    game.players.forEach(p => {
        io.to(p.id).emit('game-update', getPublicState(game, p.id))
    })

    io.to(roomId).emit('system-message', `Drawer has selected a word!`)

    game.timer = setInterval(() => {
        game.timeLeft--
        io.to(roomId).emit('timer-update', game.timeLeft)
        if (game.timeLeft <= 0) {
            io.to(roomId).emit('system-message', `Time's up! The word was ${game.currentWord}`)
            nextTurn(io, roomId)
        }
    }, 1000)
}

const handlePlayerRemove = (io: Server, roomId: string, playerId: string) => {
    const game = games[roomId]
    if (!game) return

    const playerIndex = game.players.findIndex(p => p.id === playerId)
    if (playerIndex === -1) return

    const player = game.players[playerIndex]
    const wasDrawer = playerIndex === game.drawerIndex
    const wasHost = game.hostId === playerId

    // Remove player
    game.players.splice(playerIndex, 1)

    // Adjust drawerIndex if needed
    if (playerIndex < game.drawerIndex) {
        game.drawerIndex--
    }

    // Check Game Over or Empty
    if (game.players.length === 0) {
        if (game.timer) clearInterval(game.timer)
        delete games[roomId]
        console.log(`Game ${roomId} deleted (empty)`)
    } else if (game.status !== 'LOBBY' && game.players.length < 2) {
        // Winner
        if (game.timer) clearInterval(game.timer)
        game.status = 'ENDED'
        const winner = game.players[0]
        winner.score += 100
        game.hostId = winner.id

        io.to(roomId).emit('game-update', getPublicState(game, winner.id))
        io.to(roomId).emit('system-message', 'Everyone left! You win! 🏆')
        io.to(roomId).emit('game-ended', game.players)
    } else {
        // Game Continues
        if (wasHost) {
            game.hostId = game.players[0].id
            io.to(roomId).emit('system-message', `${game.players[0].name} is now the Host! 👑`)
        }

        if (wasDrawer && game.status === 'DRAWING') {
            io.to(roomId).emit('system-message', 'Drawer disconnected! Skipping turn...')
            // Decrement index so nextTurn increments it to the *current* slot (which is the next player)
            game.drawerIndex--
            nextTurn(io, roomId)
        } else {
            // Check if everyone guessed (if only guessers remain)
            if (game.status === 'DRAWING') {
                const drawerId = game.players[game.drawerIndex]?.id
                if (drawerId) {
                    const guessers = game.players.filter(p => p.id !== drawerId)
                    if (guessers.length > 0 && guessers.every(p => p.guessed)) {
                        io.to(roomId).emit('system-message', 'Everyone guessed it!')
                        nextTurn(io, roomId)
                    }
                } else {
                    nextTurn(io, roomId)
                }
            }

            game.players.forEach(p => {
                io.to(p.id).emit('game-update', getPublicState(game, p.id))
            })
            io.to(roomId).emit('system-message', `${player.name} left.`)
        }
    }
}


export default function SocketHandler(req: any, res: any) {
    if (!res.socket.server.io) {
        const io = new Server(res.socket.server)
        res.socket.server.io = io
    }

    const io = res.socket.server.io as Server

    // Hot-Reload Fix: Remove old listener to allow code updates to apply
    const oldHandler = (res.socket.server as any)._socketHandler
    if (oldHandler) {
        io.off('connection', oldHandler)
    }

    const onConnection = (socket: Socket) => {

        socket.on('join-room', ({ roomId, username, config, avatar }) => {
            socket.join(roomId)

            let game = games[roomId]
            if (!game) {
                // Check if joining valid room
                if (!config && !games[roomId]) {
                    socket.emit('join-error', 'Room not found! Check the ID or Create a new room.')
                    return
                }

                game = {
                    roomId,
                    status: 'LOBBY',
                    players: [],
                    drawerIndex: 0,
                    currentWord: '',
                    wordOptions: [],
                    maxRounds: config?.rounds || 3,
                    currentRound: 1,
                    drawTime: config?.drawTime || 60,
                    timeLeft: 0,
                    timer: null,
                    hostId: socket.id
                }
                games[roomId] = game
            }

            // Sync/Reset player if rejoining with same socket? 
            // Actually new socket ID every refresh, so we just add.
            // Check if name is taken? (Optional, but good for clarity)

            // Add Player: Idempotent add/update
            // Improved deduplication: Check for ID OR Name match to handle reloads/reconnects
            let existingInd = game.players.findIndex(p => p.id === socket.id)

            // If not found by ID, check by Name (Session Recovery)
            if (existingInd === -1) {
                existingInd = game.players.findIndex(p => p.name === username)
            }

            if (existingInd !== -1) {
                // Update existing player (Reconnect)
                const p = game.players[existingInd]

                // Clear disconnect timeout if exists
                if (p.disconnectTimeout) {
                    clearTimeout(p.disconnectTimeout)
                    p.disconnectTimeout = undefined
                }

                const oldId = p.id
                p.name = username
                p.id = socket.id // Update to new Socket ID
                p.disconnected = false

                if (avatar) p.avatar = avatar // Update avatar if provided
                // Keep score and guessed state!

                // If they were host, update hostId
                if (game.hostId === oldId) {
                    game.hostId = socket.id
                }

                socket.emit('system-message', 'Welcome back! You reconnected.')
            } else {
                game.players.push({
                    id: socket.id,
                    name: username,
                    avatar: avatar || '🧑‍🎨',
                    score: 0,
                    guessed: false,
                    disconnected: false
                })
            }


            // Sync state
            io.to(roomId).emit('game-update', getPublicState(game, socket.id))
            game.players.forEach(p => io.to(p.id).emit('game-update', getPublicState(game, p.id)))
        })

        socket.on('start-game', ({ roomId, config }) => {
            const game = games[roomId]
            if (game) {
                if (game.players.length < 2) {
                    socket.emit('system-message', 'Need at least 2 players!')
                    return
                }
                game.maxRounds = config?.rounds || game.maxRounds
                game.drawTime = config?.drawTime || game.drawTime
                game.currentRound = 1
                game.drawerIndex = -1
                game.players.forEach(p => { p.score = 0; p.guessed = false })
                nextTurn(io, roomId)
            }
        })

        socket.on('select-word', ({ roomId, word }) => {
            const game = games[roomId]
            if (game && game.players[game.drawerIndex]?.id === socket.id) {
                startRound(io, roomId, word)
            }
        })

        socket.on('draw', (data) => {
            socket.to(data.roomId).emit('draw', data)
        })

        socket.on('fill', (data) => {
            socket.to(data.roomId).emit('fill', data)
        })

        socket.on('clear', (roomId) => {
            socket.to(roomId).emit('clear')
        })

        socket.on('undo', (roomId) => {
            socket.to(roomId).emit('undo')
        })

        socket.on('redo', (roomId) => {
            socket.to(roomId).emit('redo')
        })

        socket.on('end-draw', (roomId) => {
            socket.to(roomId).emit('end-draw')
        })

        socket.on('chat-message', (data) => {
            const game = games[data.roomId]
            if (game && game.status === 'DRAWING') {
                if (data.text.trim().toLowerCase() === game.currentWord.toLowerCase()) {
                    const player = game.players.find(p => p.id === socket.id)
                    if (player && !player.guessed && player.id !== game.players[game.drawerIndex].id) {
                        player.guessed = true
                        const points = Math.max(10, Math.ceil(game.timeLeft / game.drawTime * 500))
                        player.score += points
                        socket.to(data.roomId).emit('system-message', `🎉 ${data.user} guessed the word!`)
                        socket.emit('system-message', `🎉 You guessed the word! (+${points})`)

                        const drawer = game.players[game.drawerIndex]
                        drawer.score += 50

                        io.to(data.roomId).emit('game-update', getPublicState(game, socket.id))
                        game.players.forEach(p => io.to(p.id).emit('game-update', getPublicState(game, p.id)))

                        const guessers = game.players.filter(p => p.id !== drawer.id)
                        if (guessers.every(p => p.guessed)) {
                            io.to(data.roomId).emit('system-message', 'Everyone guessed it!')
                            nextTurn(io, data.roomId)
                        }
                        return
                    }
                }
            }
            io.to(data.roomId).emit('chat-message', data)
        })



        socket.on('disconnect', () => {
            for (const roomId in games) {
                const game = games[roomId]
                const playerIndex = game.players.findIndex(p => p.id === socket.id)

                if (playerIndex !== -1) {
                    const player = game.players[playerIndex]
                    player.disconnected = true

                    // Notify others of partial disconnect?
                    game.players.forEach(p => {
                        if (!p.disconnected) io.to(p.id).emit('game-update', getPublicState(game, p.id))
                    })

                    // Give 10 seconds to reconnect
                    player.disconnectTimeout = setTimeout(() => {
                        // Check if still disconnected (might have reconnected with new ID, but this object is the old one... 
                        // Actually, if they reconnected, we updated THIS player object's ID and cleared this timeout. 
                        // So if this runs, they are gone.)
                        handlePlayerRemove(io, roomId, player.id) // Use current ID
                    }, 10000)

                    break
                }
            }
        })
    }

    io.on('connection', onConnection)
        // Store handle for cleanup
        ; (res.socket.server as any)._socketHandler = onConnection

    res.end()
}

