import Head from 'next/head'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import FloatingSketchesBackground from '@/components/FloatingSketchesBackground'

interface Match {
    id: string
    roomId: string
    date: string
    score: number
    rank: number
    totalPlayers: number
    winnerName: string
    isWinner: boolean
}

interface ProfileData {
    user: {
        name: string
        email: string
        avatar: string
    }
    stats: {
        gamesPlayed: number
        wins: number
        totalPoints: number
        highestScore: number
    }
    history: Match[]
}

export default function Profile() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Redirect to home if unauthenticated
    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/')
        }
    }, [status, router])

    useEffect(() => {
        if (status === 'authenticated') {
            const fetchProfile = async () => {
                try {
                    const res = await fetch('/api/profile')
                    if (!res.ok) throw new Error('Failed to load profile data.')
                    const data = await res.json()
                    setProfile(data)
                } catch (err: any) {
                    setError(err.message)
                } finally {
                    setLoading(false)
                }
            }
            fetchProfile()
        }
    }, [status])

    if (status === 'loading' || loading) {
        return (
            <div className="fixed inset-0 w-full h-[100dvh] flex items-center justify-center">
                <FloatingSketchesBackground />
                <span className="text-2xl font-bold animate-pulse font-hand z-10">Loading your profile... ✏️</span>
            </div>
        )
    }

    if (!session || !profile) return null

    const winRate = profile.stats.gamesPlayed > 0
        ? Math.round((profile.stats.wins / profile.stats.gamesPlayed) * 100)
        : 0

    return (
        <div className="fixed inset-0 w-full h-[100dvh] flex flex-col items-center justify-center bg-transparent overflow-y-auto">
            <FloatingSketchesBackground />
            <Head>
                <title>{profile.user.name}'s Profile - DrawChain</title>
            </Head>

            <main className="w-full max-w-4xl p-2 sm:p-4 md:p-8 z-10 flex flex-col items-center h-full max-h-[90vh]">
                <div className="bg-white p-3 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl sketch-border shadow-2xl w-full flex flex-col min-h-0 overflow-hidden relative">

                    {/* Header */}
                    <div className="flex justify-between items-center border-b-2 border-dashed border-gray-300 pb-2 sm:pb-4 mb-3 sm:mb-6 shrink-0 gap-2">
                        <Link href="/" className="text-gray-500 hover:text-black font-bold text-xs sm:text-sm flex items-center gap-1 transition-colors shrink-0">
                            &larr; Home
                        </Link>
                        <h1 className="text-lg sm:text-3xl font-bold font-hand text-center tracking-wider text-gray-800 truncate">
                            <span className="hidden sm:inline">Player </span>Profile 🎨
                        </h1>
                        <button
                            onClick={() => signOut({ callbackUrl: '/' })}
                            className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-bold px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-xs sm:text-sm transition-all active:translate-y-px shrink-0"
                        >
                            Logout
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1 no-scrollbar space-y-4 sm:space-y-6">
                        {/* Profile Info Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">

                            {/* User details card */}
                            <div className="bg-blue-50/50 p-4 sm:p-6 rounded-xl sm:rounded-2xl border-2 border-blue-100 flex flex-col items-center justify-center text-center">
                                <div className="p-1.5 sm:p-2 bg-white rounded-xl sm:rounded-2xl border border-blue-200 shadow-sm mb-2 sm:mb-3">
                                    {profile.user.avatar && (profile.user.avatar.startsWith('/') || profile.user.avatar.startsWith('http')) ? (
                                        <img src={profile.user.avatar} alt="Avatar" className="w-14 h-14 sm:w-20 sm:h-20 object-contain rounded-xl sm:rounded-2xl border border-blue-200" loading="lazy" />
                                    ) : (
                                        <span className="text-4xl sm:text-6xl">{profile.user.avatar || '🧑‍🎨'}</span>
                                    )}
                                </div>
                                <h2 className="text-xl sm:text-2xl font-bold font-hand text-gray-800">{profile.user.name}</h2>
                                <p className="text-gray-500 font-hand text-sm sm:text-base truncate max-w-full">{profile.user.email}</p>
                            </div>

                            {/* Statistics summary card */}
                            <div className="md:col-span-2 bg-yellow-50/50 p-3 sm:p-6 rounded-xl sm:rounded-2xl border-2 border-yellow-100 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-center font-hand">
                                <div className="bg-white p-2 sm:p-3 rounded-lg sm:rounded-xl border border-yellow-200 shadow-sm flex flex-col justify-center">
                                    <span className="text-[10px] sm:text-xs text-yellow-700 font-bold uppercase tracking-wider">Played</span>
                                    <span className="text-xl sm:text-3xl font-bold font-mono text-yellow-900 mt-0.5 sm:mt-1">{profile.stats.gamesPlayed}</span>
                                </div>
                                <div className="bg-white p-2 sm:p-3 rounded-lg sm:rounded-xl border border-yellow-200 shadow-sm flex flex-col justify-center">
                                    <span className="text-[10px] sm:text-xs text-green-700 font-bold uppercase tracking-wider">Wins</span>
                                    <span className="text-xl sm:text-3xl font-bold font-mono text-green-700 mt-0.5 sm:mt-1">{profile.stats.wins}</span>
                                </div>
                                <div className="bg-white p-2 sm:p-3 rounded-lg sm:rounded-xl border border-yellow-200 shadow-sm flex flex-col justify-center">
                                    <span className="text-[10px] sm:text-xs text-blue-700 font-bold uppercase tracking-wider">Win Rate</span>
                                    <span className="text-xl sm:text-3xl font-bold font-mono text-blue-600 mt-0.5 sm:mt-1">{winRate}%</span>
                                </div>
                                <div className="bg-white p-2 sm:p-3 rounded-lg sm:rounded-xl border border-yellow-200 shadow-sm flex flex-col justify-center">
                                    <span className="text-[10px] sm:text-xs text-purple-700 font-bold uppercase tracking-wider">High Score</span>
                                    <span className="text-xl sm:text-3xl font-bold font-mono text-purple-600 mt-0.5 sm:mt-1">{profile.stats.highestScore}</span>
                                </div>
                                <div className="bg-white p-2 sm:p-3 rounded-lg sm:rounded-xl border border-yellow-200 shadow-sm col-span-2 sm:col-span-4 flex flex-col justify-center mt-0.5 sm:mt-1">
                                    <span className="text-[10px] sm:text-xs text-gray-500 font-bold uppercase tracking-wider">Total Accumulated Points</span>
                                    <span className="text-2xl sm:text-4xl font-bold font-mono text-gray-800 mt-0.5 sm:mt-1">{profile.stats.totalPoints}</span>
                                </div>
                            </div>
                        </div>

                        {/* Match History */}
                        <div className="bg-white p-3 sm:p-4 md:p-6 rounded-xl sm:rounded-2xl border-2 border-gray-100 flex flex-col">
                            <h3 className="text-lg sm:text-2xl font-bold font-hand text-gray-800 border-b pb-2 mb-3 sm:mb-4">
                                Recent Matches <span className="hidden sm:inline">(Last 10 Games)</span>
                            </h3>
                            {profile.history.length === 0 ? (
                                <div className="text-center py-6 sm:py-8 font-hand text-gray-400 font-bold text-base sm:text-lg">
                                    No matches played yet. Join a room and draw!
                                </div>
                            ) : (
                                <div className="overflow-x-auto -mx-1">
                                    <table className="w-full text-left font-hand border-collapse text-xs sm:text-sm md:text-base min-w-[400px]">
                                        <thead>
                                            <tr className="border-b-2 border-gray-300 text-gray-500 font-bold">
                                                <th className="py-1.5 sm:py-2 px-2 sm:px-3">Date</th>
                                                <th className="py-1.5 sm:py-2 px-2 sm:px-3">Room</th>
                                                <th className="py-1.5 sm:py-2 px-2 sm:px-3 text-center">Place</th>
                                                <th className="py-1.5 sm:py-2 px-2 sm:px-3 text-right">Score</th>
                                                <th className="py-1.5 sm:py-2 px-2 sm:px-3">Winner</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                                            {profile.history.map((match) => (
                                                <tr key={match.id} className={`hover:bg-gray-50/50 ${match.isWinner ? 'bg-green-50/30' : ''}`}>
                                                    <td className="py-2 sm:py-3 px-2 sm:px-3 text-gray-500">
                                                        {new Date(match.date).toLocaleDateString(undefined, {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </td>
                                                    <td className="py-2 sm:py-3 px-2 sm:px-3 uppercase font-bold">{match.roomId}</td>
                                                    <td className="py-2 sm:py-3 px-2 sm:px-3 text-center">
                                                        <span className={`inline-block px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${match.rank === 1 ? 'bg-yellow-100 text-yellow-800' :
                                                            match.rank === 2 ? 'bg-gray-100 text-gray-800' :
                                                                match.rank === 3 ? 'bg-orange-100 text-orange-950' : 'bg-gray-50 text-gray-500'
                                                            }`}>
                                                            {match.rank} / {match.totalPlayers}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 sm:py-3 px-2 sm:px-3 text-right font-mono font-bold text-blue-600">+{match.score}</td>
                                                    <td className="py-2 sm:py-3 px-2 sm:px-3 truncate max-w-[100px] sm:max-w-[150px]">
                                                        {match.isWinner ? '🏆 You!' : match.winnerName}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
