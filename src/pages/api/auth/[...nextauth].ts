import NextAuth, { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GithubProvider from 'next-auth/providers/github'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import prisma from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    session: {
        strategy: 'jwt',
    },
    providers: [
        ...(process.env.GITHUB_ID && process.env.GITHUB_ID.trim() !== "" && process.env.GITHUB_SECRET && process.env.GITHUB_SECRET.trim() !== "" ? [
            GithubProvider({
                clientId: process.env.GITHUB_ID.trim(),
                clientSecret: process.env.GITHUB_SECRET.trim(),
                allowDangerousEmailAccountLinking: true,
            })
        ] : []),
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID.trim() !== "" && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CLIENT_SECRET.trim() !== "" ? [
            GoogleProvider({
                clientId: process.env.GOOGLE_CLIENT_ID.trim(),
                clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
                allowDangerousEmailAccountLinking: true,
            })
        ] : []),
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                email: { label: 'Email', type: 'email', placeholder: 'user@example.com' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('Please enter both email and password.')
                }

                // Find user by email
                const user = await prisma.user.findUnique({
                    where: { email: credentials.email },
                    include: { stats: true }
                })

                if (!user || !user.password) {
                    throw new Error('No user found with this email.')
                }

                // Check password
                const isPasswordValid = await bcrypt.compare(credentials.password, user.password)
                if (!isPasswordValid) {
                    throw new Error('Incorrect password.')
                }

                // Return user object
                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
                }
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user, trigger, session }) {
            // Attach user.id to token
            if (user) {
                token.id = user.id
            }
            
            // Handle updates if needed
            if (trigger === 'update' && session) {
                return { ...token, ...session }
            }

            return token
        },
        async session({ session, token }) {
            if (session.user && token.id) {
                // Attach id to session.user
                (session.user as any).id = token.id as string

                // Fetch stats and add to session
                const stats = await prisma.userStats.findUnique({
                    where: { userId: token.id as string }
                })
                if (stats) {
                    (session.user as any).stats = {
                        gamesPlayed: stats.gamesPlayed,
                        wins: stats.wins,
                        totalPoints: stats.totalPoints,
                        highestScore: stats.highestScore
                    }
                }
            }
            return session
        },
    },
    events: {
        async createUser({ user }) {
            try {
                await prisma.userStats.create({
                    data: {
                        userId: user.id,
                        gamesPlayed: 0,
                        wins: 0,
                        totalPoints: 0,
                        highestScore: 0,
                    },
                })
                console.log(`[NextAuth] Auto-created UserStats for OAuth user: ${user.id}`)
            } catch (err) {
                console.error('[NextAuth] Failed to auto-create UserStats:', err)
            }
        },
    },
    secret: process.env.NEXTAUTH_SECRET || 'drawchain-default-development-secret-key-12345',
    pages: {
        signIn: '/', // Custom sign-in route (handled by modal on landing page)
    },
}

export default NextAuth(authOptions)
