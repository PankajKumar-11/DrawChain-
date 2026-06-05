import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from './auth/[...nextauth]'
import prisma from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' })
    }

    try {
        const session = await getServerSession(req, res, authOptions)
        if (!session || !session.user || !(session.user as any).id) {
            return res.status(401).json({ message: 'Unauthorized. Please log in first.' })
        }

        const userId = (session.user as any).id

        // Fetch user, their stats, and recent games
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                stats: true,
                history: {
                    take: 10,
                    include: {
                        game: {
                            include: {
                                participants: {
                                    orderBy: { score: 'desc' }
                                }
                            }
                        }
                    }
                }
            }
        })

        if (!user) {
            return res.status(404).json({ message: 'User not found.' })
        }

        // Format history to include ranking details
        const formattedHistory = user.history.map((part: any) => {
            const game = part.game
            const totalPlayers = game.participants.length
            const userRankIndex = game.participants.findIndex((p: any) => p.userId === userId)
            const rank = userRankIndex !== -1 ? userRankIndex + 1 : totalPlayers
            
            return {
                id: game.id as string,
                roomId: game.roomId as string,
                date: game.createdAt as Date,
                score: part.score as number,
                rank,
                totalPlayers,
                winnerName: (game.winnerName || 'Unknown') as string,
                isWinner: game.winnerId === userId
            }
        })

        // Sort match history by date descending
        formattedHistory.sort((a: { date: Date }, b: { date: Date }) => new Date(b.date).getTime() - new Date(a.date).getTime())

        return res.status(200).json({
            user: {
                name: user.name,
                email: user.email,
                avatar: user.image || '🧑‍🎨',
            },
            stats: {
                gamesPlayed: user.stats?.gamesPlayed || 0,
                wins: user.stats?.wins || 0,
                totalPoints: user.stats?.totalPoints || 0,
                highestScore: user.stats?.highestScore || 0,
            },
            history: formattedHistory
        })
    } catch (error: any) {
        console.error('Profile fetch error:', error)
        return res.status(500).json({ message: 'Error retrieving profile data' })
    }
}
