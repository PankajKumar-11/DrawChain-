import redis from './redis'

/**
 * Player interface - represents a player in a game room.
 * Note: disconnectTimeout is NOT stored in Redis (non-serializable).
 */
export interface Player {
    id: string
    name: string
    avatar: string
    score: number
    guessed: boolean
    disconnected?: boolean
    userId?: string
    isGuest: boolean
}

/**
 * Game interface - represents the state of a game room.
 * Note: timer is NOT stored in Redis (non-serializable).
 */
export interface Game {
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
    hostId: string
    hintWord?: string
}

// Redis key prefix for game rooms
const GAME_KEY_PREFIX = 'drawchain:game:'

/**
 * GameStore — Redis-backed game state manager.
 * 
 * All game state is stored in Redis as JSON strings under keys like:
 *   drawchain:game:{roomId}
 * 
 * Timer handles (setInterval/setTimeout) are inherently local to the
 * process and cannot be serialized. They are stored in a local Map.
 */
class GameStore {
    // Local-only: timer handles cannot be stored in Redis
    private timers: Map<string, NodeJS.Timeout> = new Map()
    private disconnectTimers: Map<string, NodeJS.Timeout> = new Map()

    private key(roomId: string): string {
        return `${GAME_KEY_PREFIX}${roomId}`
    }

    /**
     * Fetch a game from Redis by roomId.
     */
    async getGame(roomId: string): Promise<Game | null> {
        const data = await redis.get<Game>(this.key(roomId))
        return data || null
    }

    /**
     * Save/update a game in Redis.
     * TTL of 2 hours — auto-cleanup for abandoned rooms.
     */
    async setGame(roomId: string, game: Game): Promise<void> {
        await redis.set(this.key(roomId), JSON.stringify(game), { ex: 7200 })
    }

    /**
     * Delete a game from Redis.
     */
    async deleteGame(roomId: string): Promise<void> {
        await redis.del(this.key(roomId))
        this.clearTimer(roomId)
    }

    /**
     * Check if a game room exists in Redis.
     */
    async gameExists(roomId: string): Promise<boolean> {
        const exists = await redis.exists(this.key(roomId))
        return exists === 1
    }

    // --- Local Timer Management ---

    setTimer(roomId: string, timer: NodeJS.Timeout): void {
        this.clearTimer(roomId)
        this.timers.set(roomId, timer)
    }

    clearTimer(roomId: string): void {
        const existing = this.timers.get(roomId)
        if (existing) {
            clearInterval(existing)
            this.timers.delete(roomId)
        }
    }

    setDisconnectTimer(playerId: string, timer: NodeJS.Timeout): void {
        this.clearDisconnectTimer(playerId)
        this.disconnectTimers.set(playerId, timer)
    }

    clearDisconnectTimer(playerId: string): void {
        const existing = this.disconnectTimers.get(playerId)
        if (existing) {
            clearTimeout(existing)
            this.disconnectTimers.delete(playerId)
        }
    }
}

// Singleton pattern (survives hot-reloads)
const globalForGameStore = global as unknown as { gameStore: GameStore }
export const gameStore = globalForGameStore.gameStore || new GameStore()
if (process.env.NODE_ENV !== 'production') globalForGameStore.gameStore = gameStore

export default gameStore
