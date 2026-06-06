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
    const { data: session, status, update } = useSession()
    const router = useRouter()
    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [showEditModal, setShowEditModal] = useState(false)
    const [editName, setEditName] = useState('')
    const [editAvatar, setEditAvatar] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    const AVATARS = [
        '/avatars/avatar-01.png',
        '/avatars/avatar-02.png',
        '/avatars/avatar-03.png',
        '/avatars/avatar-04.png',
        '/avatars/avatar-05.png',
        '/avatars/avatar-06.png',
        '/avatars/avatar-07.png',
        '/avatars/avatar-08.png',
        '/avatars/avatar-09.png',
        '/avatars/avatar-10.png',
        '/avatars/avatar-11.png',
        '/avatars/avatar-12.png'
    ]

    const openEditModal = () => {
        if (profile) {
            setEditName(profile.user.name)
            setEditAvatar(profile.user.avatar)
            setSaveError(null)
            setShowEditModal(true)
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (editName.trim().length < 2 || editName.trim().length > 20) {
            setSaveError('Username must be between 2 and 20 characters.')
            return
        }
        
        setIsSaving(true)
        setSaveError(null)
        
        try {
            const res = await fetch('/api/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName, avatar: editAvatar })
            })
            
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.message || 'Failed to update profile.')
            }
            
            const data = await res.json()
            
            // Update NextAuth session
            await update({
                name: data.user.name,
                image: data.user.avatar
            })
            
            // Update local profile state
            setProfile(prev => prev ? {
                ...prev,
                user: {
                    ...prev.user,
                    name: data.user.name,
                    avatar: data.user.avatar
                }
            } : null)
            
            setShowEditModal(false)
        } catch (err: any) {
            setSaveError(err.message)
        } finally {
            setIsSaving(false)
        }
    }

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
                                <p className="text-gray-500 font-hand text-sm sm:text-base truncate max-w-full mb-3">{profile.user.email}</p>
                                <button
                                    onClick={openEditModal}
                                    className="bg-blue-100 hover:bg-blue-200 border-2 border-black px-4 py-1.5 rounded-xl font-bold font-hand text-xs sm:text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer shrink-0"
                                >
                                    Edit Profile ✏️
                                </button>
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

            {/* Edit Profile Modal */}
            {showEditModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in font-hand">
                    <div className="bg-white p-6 rounded-2xl sm:rounded-3xl sketch-border shadow-2xl max-w-md w-full relative transform animate-fade-in-up flex flex-col gap-4">
                        <button
                            type="button"
                            onClick={() => setShowEditModal(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-black font-bold text-xl transition-colors"
                        >
                            &times;
                        </button>
                        
                        <h2 className="text-2xl font-bold border-b-2 border-dashed border-gray-200 pb-2 text-center text-gray-800">
                            Edit Profile
                        </h2>

                        <form onSubmit={handleSave} className="flex flex-col gap-4">
                            {saveError && (
                                <div className="bg-red-50 text-red-600 border-2 border-red-200 rounded-xl p-3 text-xs sm:text-sm font-bold text-center">
                                    {saveError}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-bold text-gray-500 mb-1">Username</label>
                                <input
                                    type="text"
                                    required
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="w-full border-2 border-gray-200 rounded-xl p-2.5 text-base focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all font-hand"
                                    placeholder="e.g. Leonardo"
                                    disabled={isSaving}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-500 mb-1.5 text-center">Choose Avatar</label>
                                <div className="grid grid-cols-4 gap-2.5 max-h-[160px] overflow-y-auto p-1.5 no-scrollbar bg-gray-50 rounded-xl border border-gray-200">
                                    {AVATARS.map(a => (
                                        <button
                                            key={a}
                                            type="button"
                                            onClick={() => setEditAvatar(a)}
                                            className={`p-1 rounded-xl transition-all hover:scale-105 shrink-0 flex items-center justify-center border-2 ${editAvatar === a ? 'bg-blue-100 border-blue-400 scale-105 shadow-md' : 'bg-white border-transparent'}`}
                                            disabled={isSaving}
                                        >
                                            <img src={a} alt="Avatar" className="w-10 h-10 object-contain" loading="lazy" />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-3 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowEditModal(false)}
                                    className="flex-1 bg-white hover:bg-gray-50 border-2 border-black py-2 rounded-xl font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer text-center"
                                    disabled={isSaving}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-blue-500 hover:bg-blue-600 border-2 border-black text-white py-2 rounded-xl font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer text-center"
                                    disabled={isSaving}
                                >
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
