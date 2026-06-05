import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' })
    }

    try {
        const { username, email, password, avatar } = req.body

        if (!username || !email || !password) {
            return res.status(400).json({ message: 'Missing fields: username, email, and password are required.' })
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        })

        if (existingUser) {
            return res.status(400).json({ message: 'A user with this email already exists.' })
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10)

        // Create user and empty stats inside a transaction
        const user = await prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    name: username,
                    email,
                    password: hashedPassword,
                    image: avatar || '🧑‍🎨',
                },
            })

            await tx.userStats.create({
                data: {
                    userId: newUser.id,
                    gamesPlayed: 0,
                    wins: 0,
                    totalPoints: 0,
                    highestScore: 0,
                },
            })

            return newUser
        })

        return res.status(201).json({ message: 'User registered successfully!', userId: user.id })
    } catch (error: any) {
        console.error('Registration error:', error)
        return res.status(500).json({ message: 'An error occurred during registration. Please try again.' })
    }
}
