import { Server, Socket } from 'socket.io'
import { WORDS } from '@/lib/words'
import { getToken } from 'next-auth/jwt'
import prisma from '@/lib/prisma'
import gameStore, { Game, Player } from '@/lib/gameStore'

// Helper to clean game state for public consumption (hiding words)
const getPublicState = (game: Game, playerId: string) => {
    const isDrawer = game.players[game.drawerIndex]?.id === playerId
    const hasGuessed = game.players.find(p => p.id === playerId)?.guessed

    let publicWord = game.currentWord
    if (game.status === 'DRAWING' && !isDrawer && !hasGuessed) {
        publicWord = game.hintWord || game.currentWord.replace(/./g, '_')
    }

    return {
        ...game,
        currentWord: publicWord,
        wordOptions: (game.status === 'SELECTING' && !isDrawer)
            ? []
            : game.wordOptions,
    }
}

// Reveal a random letter in the game hint mask (leaving at least 2 letters unrevealed)
const revealRandomHint = (game: Game): boolean => {
    if (!game.hintWord) return false
    const word = game.currentWord.toLowerCase()
    
    const unrevealedIndices: number[] = []
    for (let i = 0; i < word.length; i++) {
        if (word[i] !== ' ' && game.hintWord[i] === '_') {
            unrevealedIndices.push(i)
        }
    }
    
    if (unrevealedIndices.length > 2) {
        const randomIndex = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)]
        const hintArr = game.hintWord.split('')
        hintArr[randomIndex] = game.currentWord[randomIndex]
        game.hintWord = hintArr.join('')
        return true
    }
    return false
}

const get3Words = () => {
    const indices = new Set<number>()
    while (indices.size < 3 && indices.size < WORDS.length) {
        indices.add(Math.floor(Math.random() * WORDS.length))
    }
    return Array.from(indices).map(i => WORDS[i])
}

const saveGameResults = async (roomId: string, players: Player[]) => {
    try {
        if (players.length === 0) return

        let winner: Player | null = null
        for (const p of players) {
            if (!winner || p.score > winner.score) {
                winner = p
            }
        }

        await prisma.gameHistory.create({
            data: {
                roomId,
                winnerId: winner?.userId || null,
                winnerName: winner?.name || null,
                participants: {
                    create: players.map(p => ({
                        userId: p.userId || null,
                        score: p.score,
                        name: p.name,
                    }))
                }
            }
        })

        for (const p of players) {
            if (p.userId) {
                const isWinner = winner && p.userId === winner.userId
                const stats = await prisma.userStats.findUnique({
                    where: { userId: p.userId }
                })
                if (stats) {
                    await prisma.userStats.update({
                        where: { userId: p.userId },
                        data: {
                            gamesPlayed: { increment: 1 },
                            wins: isWinner ? { increment: 1 } : undefined,
                            totalPoints: { increment: p.score },
                            highestScore: Math.max(stats.highestScore, p.score)
                        }
                    })
                } else {
                    await prisma.userStats.create({
                        data: {
                            userId: p.userId,
                            gamesPlayed: 1,
                            wins: isWinner ? 1 : 0,
                            totalPoints: p.score,
                            highestScore: p.score
                        }
                    })
                }
            }
        }
        console.log(`[Redis] Saved game results for room ${roomId}`)
    } catch (error) {
        console.error('saveGameResults failed:', error)
    }
}

const nextTurn = async (io: Server, roomId: string) => {
    const game = await gameStore.getGame(roomId)
    if (!game) return

    gameStore.clearTimer(roomId)

    // Clear canvas
    io.to(roomId).emit('clear')

    game.drawerIndex++
    if (game.drawerIndex >= game.players.length) {
        game.drawerIndex = 0
        game.currentRound++
    }

    if (game.currentRound > game.maxRounds) {
        game.status = 'ENDED'
        game.players.forEach(p => {
            io.to(p.id).emit('game-update', getPublicState(game, p.id))
        })
        io.to(roomId).emit('game-ended', game.players)

        await gameStore.setGame(roomId, game)

        saveGameResults(roomId, game.players).catch(err => {
            console.error('Error saving game results:', err)
        })
        return
    }

    // Set SELECTING state
    game.status = 'SELECTING'
    game.wordOptions = get3Words()
    game.currentWord = ''
    game.timeLeft = 15
    game.players.forEach(p => p.guessed = false)

    // Broadcast update
    game.players.forEach(p => {
        io.to(p.id).emit('game-update', getPublicState(game, p.id))
    })

    await gameStore.setGame(roomId, game)

    // Timer for selection (local)
    const selectionTimer = setInterval(async () => {
        const g = await gameStore.getGame(roomId)
        if (!g || g.status !== 'SELECTING') { clearInterval(selectionTimer); return }

        g.timeLeft--
        if (g.timeLeft <= 0) {
            clearInterval(selectionTimer)
            await startRound(io, roomId, g.wordOptions[0])
        } else {
            await gameStore.setGame(roomId, g)
            io.to(roomId).emit('timer-update', g.timeLeft)
        }
    }, 1000)
    gameStore.setTimer(roomId, selectionTimer)
}

const startRound = async (io: Server, roomId: string, word: string) => {
    const game = await gameStore.getGame(roomId)
    if (!game) return
    gameStore.clearTimer(roomId)

    game.status = 'DRAWING'
    game.currentWord = word
    game.wordOptions = []
    game.timeLeft = game.drawTime
    game.hintWord = word.split('').map(char => char === ' ' ? ' ' : '_').join('')

    game.players.forEach(p => {
        io.to(p.id).emit('game-update', getPublicState(game, p.id))
    })

    io.to(roomId).emit('system-message', `Drawer has selected a word!`)

    await gameStore.setGame(roomId, game)

    const drawTimer = setInterval(async () => {
        const g = await gameStore.getGame(roomId)
        if (!g || g.status !== 'DRAWING') { clearInterval(drawTimer); return }

        g.timeLeft--
        io.to(roomId).emit('timer-update', g.timeLeft)

        const hint1Time = Math.floor(g.drawTime * 0.6)
        const hint2Time = Math.floor(g.drawTime * 0.3)

        if (g.timeLeft === hint1Time || g.timeLeft === hint2Time) {
            const revealed = revealRandomHint(g)
            if (revealed) {
                io.to(roomId).emit('system-message', '💡 A hint has been revealed!')
                g.players.forEach(p => {
                    io.to(p.id).emit('game-update', getPublicState(g, p.id))
                })
            }
        }

        if (g.timeLeft <= 0) {
            io.to(roomId).emit('system-message', `Time's up! The word was ${g.currentWord}`)
            clearInterval(drawTimer)
            await gameStore.setGame(roomId, g)
            await nextTurn(io, roomId)
        } else {
            await gameStore.setGame(roomId, g)
        }
    }, 1000)
    gameStore.setTimer(roomId, drawTimer)
}

const handlePlayerRemove = async (io: Server, roomId: string, playerId: string) => {
    const game = await gameStore.getGame(roomId)
    if (!game) return

    const playerIndex = game.players.findIndex(p => p.id === playerId)
    if (playerIndex === -1) return

    const player = game.players[playerIndex]
    const wasDrawer = playerIndex === game.drawerIndex
    const wasHost = game.hostId === playerId

    game.players.splice(playerIndex, 1)

    if (playerIndex < game.drawerIndex) {
        game.drawerIndex--
    }

    if (game.players.length === 0) {
        gameStore.clearTimer(roomId)
        await gameStore.deleteGame(roomId)
        console.log(`[Redis] Game ${roomId} deleted (empty)`)
    } else if (game.status !== 'LOBBY' && game.players.length < 2) {
        gameStore.clearTimer(roomId)
        game.status = 'ENDED'
        const winner = game.players[0]
        winner.score += 100
        game.hostId = winner.id

        io.to(roomId).emit('game-update', getPublicState(game, winner.id))
        io.to(roomId).emit('system-message', 'Everyone left! You win! 🏆')
        io.to(roomId).emit('game-ended', game.players)

        await gameStore.setGame(roomId, game)

        saveGameResults(roomId, game.players).catch(err => {
            console.error('Error saving game results:', err)
        })
    } else {
        if (wasHost) {
            game.hostId = game.players[0].id
            io.to(roomId).emit('system-message', `${game.players[0].name} is now the Host! 👑`)
        }

        if (wasDrawer && game.status === 'DRAWING') {
            io.to(roomId).emit('system-message', 'Drawer disconnected! Skipping turn...')
            game.drawerIndex--
            await gameStore.setGame(roomId, game)
            await nextTurn(io, roomId)
        } else {
            if (game.status === 'DRAWING') {
                const drawerId = game.players[game.drawerIndex]?.id
                if (drawerId) {
                    const guessers = game.players.filter(p => p.id !== drawerId)
                    if (guessers.length > 0 && guessers.every(p => p.guessed)) {
                        io.to(roomId).emit('system-message', 'Everyone guessed it!')
                        await gameStore.setGame(roomId, game)
                        await nextTurn(io, roomId)
                        return
                    }
                } else {
                    await gameStore.setGame(roomId, game)
                    await nextTurn(io, roomId)
                    return
                }
            }

            game.players.forEach(p => {
                io.to(p.id).emit('game-update', getPublicState(game, p.id))
            })
            io.to(roomId).emit('system-message', `${player.name} left.`)

            await gameStore.setGame(roomId, game)
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

        socket.on('join-room', async ({ roomId, username, config, avatar }) => {
            socket.join(roomId);
            // Track which room this socket is in (needed for disconnect handler)
            (socket as any)._drawchainRoom = roomId

            let game = await gameStore.getGame(roomId)
            if (!game) {
                // Check if joining valid room
                if (!config) {
                    const exists = await gameStore.gameExists(roomId)
                    if (!exists) {
                        socket.emit('join-error', 'Room not found! Check the ID or Create a new room.')
                        return
                    }
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
                    hostId: socket.id
                }
            }

            // Resolve auth from session token
            let authUser: any = null
            try {
                const token = await getToken({ 
                    req: socket.request as any, 
                    secret: process.env.NEXTAUTH_SECRET || 'drawchain-default-development-secret-key-12345' 
                })
                if (token) {
                    authUser = token
                }
            } catch (err) {
                console.error('Socket auth error:', err)
            }

            // Add Player: Idempotent add/update
            let existingInd = game.players.findIndex(p => p.id === socket.id)

            if (existingInd === -1) {
                if (authUser) {
                    existingInd = game.players.findIndex(p => p.userId === authUser.id)
                } else {
                    existingInd = game.players.findIndex(p => p.name === username && p.isGuest)
                }
            }

            if (existingInd !== -1) {
                const p = game.players[existingInd]

                gameStore.clearDisconnectTimer(p.id)

                const oldId = p.id
                p.id = socket.id
                p.disconnected = false

                if (authUser) {
                    p.name = authUser.name || p.name
                    p.avatar = authUser.picture || p.avatar
                } else {
                    p.name = username || p.name
                    if (avatar) p.avatar = avatar
                }

                if (game.hostId === oldId) {
                    game.hostId = socket.id
                }

                socket.emit('system-message', 'Welcome back! You reconnected.')
            } else {
                game.players.push({
                    id: socket.id,
                    name: authUser ? (authUser.name || username) : username,
                    avatar: authUser ? (authUser.picture || '🧑‍🎨') : (avatar || '🧑‍🎨'),
                    score: 0,
                    guessed: false,
                    disconnected: false,
                    userId: authUser ? authUser.id : undefined,
                    isGuest: !authUser
                })
            }

            await gameStore.setGame(roomId, game)

            // Sync state
            io.to(roomId).emit('game-update', getPublicState(game, socket.id))
            game.players.forEach(p => io.to(p.id).emit('game-update', getPublicState(game, p.id)))
        })

        socket.on('start-game', async ({ roomId, config }) => {
            const game = await gameStore.getGame(roomId)
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
                await gameStore.setGame(roomId, game)
                await nextTurn(io, roomId)
            }
        })

        socket.on('select-word', async ({ roomId, word }) => {
            const game = await gameStore.getGame(roomId)
            if (game && game.players[game.drawerIndex]?.id === socket.id) {
                await startRound(io, roomId, word)
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

        socket.on('chat-message', async (data) => {
            const game = await gameStore.getGame(data.roomId)
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
                            await gameStore.setGame(data.roomId, game)
                            await nextTurn(io, data.roomId)
                        } else {
                            await gameStore.setGame(data.roomId, game)
                        }
                        return
                    }
                }
            }
            io.to(data.roomId).emit('chat-message', data)
        })

        socket.on('disconnect', async () => {
            // Retrieve the room tracked for this socket connection
            const roomId = (socket as any)._drawchainRoom
            if (!roomId) return

            const game = await gameStore.getGame(roomId)
            if (!game) return

            const playerIndex = game.players.findIndex(p => p.id === socket.id)
            if (playerIndex === -1) return

            const player = game.players[playerIndex]
            player.disconnected = true

            await gameStore.setGame(roomId, game)

            // Notify others
            game.players.forEach(p => {
                if (!p.disconnected) io.to(p.id).emit('game-update', getPublicState(game, p.id))
            })

            // Give 10 seconds to reconnect
            const disconnectTimer = setTimeout(async () => {
                await handlePlayerRemove(io, roomId, player.id)
            }, 10000)
            gameStore.setDisconnectTimer(socket.id, disconnectTimer)
        })


    }

    io.on('connection', onConnection)
        // Store handle for cleanup
        ; (res.socket.server as any)._socketHandler = onConnection

    res.end()
}
