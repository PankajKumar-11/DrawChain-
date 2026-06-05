import Head from 'next/head'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import FloatingSketchesBackground from '@/components/FloatingSketchesBackground'

interface LeaderboardEntry {
    rank: number
    userId: string
    name: string
    avatar: string
    gamesPlayed: number
    wins: number
    totalPoints: number
    highestScore: number
}

export default function Leaderboard() {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const res = await fetch('/api/leaderboard')
                if (!res.ok) throw new Error('Failed to load leaderboard data.')
                const data = await res.json()
                setLeaderboard(data)
            } catch (err: any) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }
        fetchLeaderboard()
    }, [])

    const getRankIcon = (rank: number) => {
        if (rank === 1) return '👑'
        if (rank === 2) return '🥈'
        if (rank === 3) return '🥉'
        return `#${rank}`
    }

    return (
        <div className="fixed inset-0 w-full h-[100dvh] flex flex-col items-center justify-center bg-transparent overflow-y-auto">
            <FloatingSketchesBackground />
            <Head>
                <title>Leaderboard - DrawChain</title>
            </Head>

            <main className="w-full max-w-4xl p-4 md:p-8 z-10 flex flex-col items-center h-full max-h-[90vh]">
                <div className="bg-white p-6 md:p-8 rounded-3xl sketch-border shadow-2xl w-full flex flex-col min-h-0 overflow-hidden relative">
                    
                    {/* Header */}
                    <div className="flex justify-between items-center border-b-2 border-dashed border-gray-300 pb-4 mb-6 shrink-0">
                        <Link href="/" className="text-gray-500 hover:text-black font-bold text-sm flex items-center gap-1 transition-colors">
                            &larr; Home
                        </Link>
                        <h1 className="text-3xl md:text-4xl font-bold font-hand text-center tracking-wider text-gray-800">
                            Global Leaderboard 🏆
                        </h1>
                        <div className="w-12"></div> {/* spacer */}
                    </div>

                    {/* Content Section */}
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <span className="text-2xl font-bold animate-pulse font-hand">Loading stats... ✏️</span>
                        </div>
                    ) : error ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-red-500 font-bold font-hand gap-2">
                            <span className="text-4xl">⚠️</span>
                            <span>{error}</span>
                        </div>
                    ) : leaderboard.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 font-bold font-hand gap-2">
                            <span className="text-5xl">🎨</span>
                            <span>No games played yet. Be the first to win!</span>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto pr-1 no-scrollbar md:block">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left font-hand border-collapse">
                                    <thead>
                                        <tr className="border-b-2 border-black text-gray-500 uppercase tracking-wider text-sm md:text-base">
                                            <th className="py-3 px-4">Rank</th>
                                            <th className="py-3 px-4">Player</th>
                                            <th className="py-3 px-4 text-center">Played</th>
                                            <th className="py-3 px-4 text-center">Wins</th>
                                            <th className="py-3 px-4 text-center">Win Rate</th>
                                            <th className="py-3 px-4 text-right">High Score</th>
                                            <th className="py-3 px-4 text-right">Total Score</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-base md:text-xl font-medium text-gray-700">
                                        {leaderboard.map((player) => {
                                            const winRate = player.gamesPlayed > 0 
                                                ? Math.round((player.wins / player.gamesPlayed) * 100) 
                                                : 0
                                            
                                            return (
                                                <tr key={player.userId} className="hover:bg-yellow-50/50 transition-colors">
                                                    <td className="py-4 px-4 font-mono font-bold text-center w-16">
                                                        <span className={`inline-block py-1 px-2 rounded-full ${
                                                            player.rank === 1 ? 'bg-yellow-100 text-yellow-800 text-lg' :
                                                            player.rank === 2 ? 'bg-gray-100 text-gray-800 text-lg' :
                                                            player.rank === 3 ? 'bg-orange-100 text-orange-900 text-lg' : 'text-gray-500'
                                                        }`}>
                                                            {getRankIcon(player.rank)}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-4">
                                                        <div className="flex items-center gap-3">
                                                            {player.avatar.startsWith('/') ? (
                                                                <img src={player.avatar} alt="Avatar" className="w-10 h-10 object-contain rendering-pixelated filter drop-shadow-sm shrink-0" />
                                                            ) : (
                                                                <span className="text-2xl shrink-0">{player.avatar}</span>
                                                            )}
                                                            <span className="font-bold truncate max-w-[120px] md:max-w-none">{player.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-4 text-center font-mono">{player.gamesPlayed}</td>
                                                    <td className="py-4 px-4 text-center font-mono text-green-600 font-bold">{player.wins}</td>
                                                    <td className="py-4 px-4 text-center font-mono text-blue-600">{winRate}%</td>
                                                    <td className="py-4 px-4 text-right font-mono font-bold">{player.highestScore}</td>
                                                    <td className="py-4 px-4 text-right font-mono font-bold text-purple-600">{player.totalPoints}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
