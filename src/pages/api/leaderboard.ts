import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' })
    }

    try {
        const leaderboard = await prisma.userStats.findMany({
            take: 20,
            orderBy: [
                { totalPoints: 'desc' },
                { wins: 'desc' }
            ],
            include: {
                user: {
                    select: {
                        name: true,
                        image: true,
                    }
                }
            }
        })

        const formatted = leaderboard.map((item, index) => ({
            rank: index + 1,
            userId: item.userId,
            name: item.user?.name || 'Anonymous',
            avatar: item.user?.image || '🧑‍🎨',
            gamesPlayed: item.gamesPlayed,
            wins: item.wins,
            totalPoints: item.totalPoints,
            highestScore: item.highestScore,
        }))

        return res.status(200).json(formatted)
    } catch (error: any) {
        console.error('Leaderboard fetch error:', error)
        return res.status(500).json({ message: 'Error retrieving leaderboard' })
    }
}
