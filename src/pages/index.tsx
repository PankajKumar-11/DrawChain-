import Head from 'next/head'
import { Canvas } from '@/components/Canvas'
import { Chat } from '@/components/Chat'
import { useEffect, useState } from 'react'
import io, { type Socket } from 'socket.io-client'

import FloatingSketchesBackground from '@/components/FloatingSketchesBackground'
import dynamic from 'next/dynamic'



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


interface Player {
  id: string
  name: string
  avatar: string
  score: number

  guessed: boolean
}

// Minimal matching interface for what backend sends
interface GameState {
  roomId: string
  status: 'LOBBY' | 'SELECTING' | 'DRAWING' | 'ENDED'
  players: Player[]
  drawerIndex: number
  currentWord: string // Hidden (masked) for guessers
  wordOptions: string[]
  maxRounds: number
  currentRound: number
  drawTime: number
  // timeLeft is synced separately for performance

  hostId: string
}

const generateRoomId = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [roomId, setRoomId] = useState('room1')
  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState(AVATARS[0])
  const [hasJoined, setHasJoined] = useState(false)

  const [view, setView] = useState<'LANDING' | 'CREATE' | 'JOIN'>('LANDING')

  // Game Config
  const [rounds, setRounds] = useState(3)
  const [drawTime, setDrawTime] = useState(60)

  const [game, setGame] = useState<GameState | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [meme, setMeme] = useState<string | null>(null)
  // No showPlayers toggle needed for parallel view

  const MEMES = ["Big Brain Time! 🧠", "Picasso? 🎨", "Sketch God! ✨", "Too Fast! ⚡", "Sniper! 🎯"]



  useEffect(() => {
    let newSocket: Socket | null = null;
    let isMounted = true;

    const socketInitializer = async () => {
      await fetch('/api/socket')
      if (!isMounted) return;

      newSocket = io()
      setSocket(newSocket)

      newSocket.on('connect', () => {
        console.log('Connected to socket', newSocket?.id)
      })

      newSocket.on('game-update', (data: GameState) => {
        if (isMounted) setGame(data)
      })

      newSocket.on('timer-update', (time: number) => {
        if (isMounted) setTimeLeft(time)
      })

      newSocket.on('system-message', (msg: string) => {
        if (!isMounted) return
        if (msg.includes('guessed the word')) {
          const randomMeme = MEMES[Math.floor(Math.random() * MEMES.length)]
          setMeme(randomMeme)
          setTimeout(() => setMeme(null), 3000)
        }
      })

      newSocket.on('join-error', (msg: string) => {
        if (!isMounted) return
        alert(msg)
        setHasJoined(false)
        setView('JOIN')
      })
    }

    socketInitializer()

    return () => {
      isMounted = false;
      if (newSocket) {
        newSocket.disconnect()
        newSocket.removeAllListeners()
      }
    }
  }, [])

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    if (username && socket) {
      const cleanRoomId = (roomId || 'room1').trim().toLowerCase()
      setRoomId(cleanRoomId)

      if (view === 'CREATE') {
        socket.emit('join-room', { roomId: cleanRoomId, username, config: { rounds, drawTime }, avatar })
      } else {
        socket.emit('join-room', { roomId: cleanRoomId, username, avatar })
      }
      setHasJoined(true)
    }
  }

  const copyRoomId = () => {
    if (game?.roomId) {
      navigator.clipboard.writeText(game.roomId)
      alert(`Copied Room ID: ${game.roomId}`)
    }
  }


  const startGame = () => {
    if (socket && game) {
      socket.emit('start-game', { roomId: game.roomId, config: { rounds, drawTime } })
    }
  }

  const selectWord = (word: string) => {
    if (socket && game) {
      socket.emit('select-word', { roomId: game.roomId, word })
    }
  }

  // Derived state
  const isDrawer = game && socket && game.players[game.drawerIndex]?.id === socket.id
  const currentDrawerId = game?.players[game?.drawerIndex]?.id
  const currentDrawerName = game?.players[game?.drawerIndex]?.name || 'Unknown'

  // leaderboard sorting
  const sortedPlayers = game ? [...game.players].sort((a, b) => b.score - a.score) : []

  // Helper to render secret word with explicit underscores
  const renderSecretWord = () => {
    if (!game || !game.currentWord) return null
    if (game.status !== 'DRAWING') return game.status

    // Explicit Drawer View
    if (isDrawer) {
      return (
        <div className="flex flex-col items-center leading-none">
          <span className="text-[10px] text-blue-500 font-bold tracking-widest uppercase mb-1">Your Word</span>
          <span className="text-3xl text-blue-600 font-black tracking-wider filter drop-shadow-sm">{game.currentWord}</span>
        </div>
      )
    }

    // Explicit Guesser View (Blocks)
    return (
      <div className="flex gap-1 items-center justify-center">
        <span className="mr-2 text-sm text-gray-500 font-bold">Guess:</span>
        {game.currentWord.split('').map((char, i) => (
          <span key={i} className="text-xl font-bold font-mono border-b-2 border-black h-6 w-4 flex items-center justify-center mx-0.5" style={{ lineHeight: '100%' }}>
            {char === ' ' ? '\u00A0' : (game.status === 'ENDED' ? char : '_')}
          </span>
        ))}
      </div>
    )
  }

  const renderMobileSecretWord = () => {
    if (!game || !game.currentWord) return null
    if (game.status !== 'DRAWING') return game.status

    // Explicit Drawer View (Mobile)
    if (isDrawer) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded font-bold uppercase">Draw</span>
          <span className="text-lg font-black text-blue-700">{game.currentWord}</span>
        </div>
      )
    }

    // Explicit Guesser View (Mobile Blocks)
    return (
      <div className="flex gap-1 items-end">
        {game.currentWord.split('').map((char, i) => (
          char === ' ' ?
            <span key={i} className="w-2"></span> :
            <span key={i} className="text-lg font-bold font-mono border-b-2 border-gray-800 min-w-[12px] text-center leading-none text-transparent select-none relative top-[-2px]">_</span>
        ))}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col items-center justify-center bg-transparent overflow-y-auto lg:overflow-hidden">
      <FloatingSketchesBackground />
      <Head>
        <title>DrawChain - Multiplayer</title>
      </Head>

      {/* Absolute Header for Title (Desktop Only) */}
      {!hasJoined && (
        <h1 className="hidden lg:block absolute top-6 left-8 text-4xl font-bold text-gray-800 tracking-wider animate-bounce-slow z-50 font-hand" style={{ textShadow: '2px 2px 0px #ccc' }}>
          DrawChain ✏️
        </h1>
      )}

      <main className="flex flex-col items-center justify-center w-full h-full p-2 md:p-4">

        {!hasJoined ? (
          <div className="w-full flex items-center justify-center">

            {/* VIEW 1: LANDING SELECTION */}
            {view === 'LANDING' && (
              <div className="flex flex-col md:flex-row gap-6 animate-fade-in-up w-full max-w-4xl justify-center items-stretch">
                {/* Create Card */}
                <button onClick={() => { setView('CREATE'); setRoomId(generateRoomId()) }} className="flex-1 bg-white p-8 rounded-2xl sketch-border shadow-lg hover:scale-105 transition-transform group relative overflow-hidden text-left min-h-[200px] flex flex-col justify-between">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="text-9xl">🎨</span>
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold mb-2 group-hover:text-blue-600 transition-colors font-hand">Create Room</h2>
                    <p className="text-gray-500 font-medium">Host a new game, set the rules, and invite friends.</p>
                  </div>
                  <div className="mt-6 bg-blue-100 text-blue-600 font-bold py-2 px-4 rounded-lg w-fit group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    Start Hosting &rarr;
                  </div>
                </button>

                {/* Join Card */}
                <button onClick={() => { setView('JOIN'); setRoomId('') }} className="flex-1 bg-white p-8 rounded-2xl sketch-border shadow-lg hover:scale-105 transition-transform group relative overflow-hidden text-left min-h-[200px] flex flex-col justify-between">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="text-9xl">🚀</span>
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold mb-2 group-hover:text-green-600 transition-colors font-hand">Join Room</h2>
                    <p className="text-gray-500 font-medium">Have a code? Jump into an existing game lobby.</p>
                  </div>
                  <div className="mt-6 bg-green-100 text-green-600 font-bold py-2 px-4 rounded-lg w-fit group-hover:bg-green-600 group-hover:text-white transition-colors">
                    Join Game &rarr;
                  </div>
                </button>
              </div>
            )}

            {/* VIEW 2 & 3: FORM (CREATE or JOIN) */}
            {view !== 'LANDING' && (
              <form onSubmit={handleJoin} className="bg-white p-6 md:p-10 sketch-border max-w-lg w-full flex flex-col gap-6 relative transform shadow-xl animate-fade-in-up">

                {/* Back Button */}
                <button type="button" onClick={() => setView('LANDING')} className="absolute top-4 left-4 text-gray-400 hover:text-black font-bold text-sm flex items-center gap-1 transition-colors">
                  &larr; Back
                </button>

                <h2 className="text-3xl font-bold text-center mb-2 pt-4 border-b-2 border-dashed border-gray-300 pb-2 font-hand">
                  {view === 'CREATE' ? 'Setup Game' : 'Join Game'}
                </h2>

                <div className="space-y-6">
                  {/* Avatar Selection */}
                  <div className="flex flex-col items-center">
                    <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wide">Choose Avatar</label>
                    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar max-w-full w-full px-2">
                      {AVATARS.map(a => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAvatar(a)}
                          className={`p-1 rounded-xl transition-all hover:scale-110 hover:shadow-md shrink-0 ${avatar === a ? 'bg-blue-100 border-2 border-blue-400 scale-125 shadow-lg' : 'bg-gray-50'}`}
                        >
                          <img src={a} alt="Avatar" className="w-12 h-12 object-contain rendering-pixelated" />
                        </button>

                      ))}
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-500 mb-1">Your Name</label>
                      <input
                        className="w-full border-2 border-gray-200 rounded-lg p-3 text-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all font-hand"
                        placeholder="e.g. Picasso"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-500 mb-1">Room ID</label>
                      <input
                        className="w-full border-2 border-gray-200 rounded-lg p-3 text-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all font-bold font-mono tracking-wider text-center uppercase"
                        placeholder={view === 'CREATE' ? 'Auto-generated' : 'Enter Room ID'}
                        value={roomId}
                        onChange={e => setRoomId(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* CREATE ONLY: Config */}
                  {view === 'CREATE' && (
                    <div className="flex gap-4 bg-yellow-50 p-4 rounded-xl border border-yellow-200 border-dashed">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-yellow-700 mb-1 uppercase">Rounds</label>
                        <input type="number" min="1" max="10" value={rounds} onChange={e => setRounds(Number(e.target.value))} className="w-full p-2 bg-white border border-yellow-300 rounded-lg font-bold text-center" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-yellow-700 mb-1 uppercase">Draw Time (s)</label>
                        <input type="number" min="10" max="180" step="10" value={drawTime} onChange={e => setDrawTime(Number(e.target.value))} className="w-full p-2 bg-white border border-yellow-300 rounded-lg font-bold text-center" />
                      </div>
                    </div>
                  )}
                </div>

                <button className={`mt-2 text-white text-xl py-4 px-6 rounded-xl sketch-border hover:-translate-y-1 transition-transform shadow-lg flex items-center justify-center gap-3 font-bold tracking-wide ${view === 'CREATE' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}>
                  {view === 'CREATE' ? 'Create Lobby 🏠' : 'Enter Room 🚪'}
                </button>
              </form>
            )}

          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-4 w-full h-full lg:max-h-[800px] items-stretch animate-fade-in-up flex-1 min-h-0 relative">

            {/* Desktop Left Sidebar (Players - Sorted) */}
            <div className={`hidden lg:flex lg:w-60 lg:flex-col lg:h-full lg:bg-white lg:p-3 lg:rounded-xl lg:shadow-lg lg:sketch-border lg:min-h-0 lg:shrink-0`}>
              <h3 className="text-xl font-bold mb-2 border-b pb-1 text-center font-hand bg-yellow-50 rounded">DrawChain ✏️</h3>
              <div className="flex justify-between items-center mb-2 border-b pb-2">
                <h3 className="text-lg font-bold">Standings</h3>
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">Score</span>
              </div>

              <ul className="space-y-3 overflow-y-auto flex-1 pr-1 font-hand p-1">
                {sortedPlayers.map((p, i) => (
                  <li key={p.id} className={`flex justify-between items-center p-3 rounded-lg border-2 transition-all ${p.guessed ? 'bg-green-50 border-green-200 shadow-sm' : 'bg-white border-gray-100 hover:border-blue-200'}`}>
                    <div className="flex flex-col">
                      <span className={`${currentDrawerId === p.id ? 'font-bold text-blue-600' : ''} flex items-center gap-2`}>
                        <div className={`font-mono font-bold text-xs w-5 h-5 flex items-center justify-center rounded-full ${i === 0 ? 'bg-yellow-300 text-yellow-800' : i === 1 ? 'bg-gray-300 text-gray-800' : i === 2 ? 'bg-orange-300 text-orange-900' : 'bg-gray-100 text-gray-500'}`}>
                          #{i + 1}
                        </div>
                        <img src={p.avatar} alt="Avatar" className="w-10 h-10 object-contain rendering-pixelated filter drop-shadow-sm" />
                        <div className="flex flex-col leading-tight">

                          <span className="text-base flex items-center gap-2">
                            {p.name}
                            {socket?.id === p.id && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-200 font-bold">You</span>}
                          </span>
                          {currentDrawerId === p.id && <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500">Drawing</span>}
                        </div>
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-bold text-lg">{p.score}</span>
                      {p.guessed && <span className="text-green-600 text-xs font-bold">Guessed!</span>}
                    </div>
                  </li>
                ))}
              </ul>


              {/* Action Buttons */}
              <div className="flex flex-col gap-3 mt-4 shrink-0 pt-4 border-t-2 border-gray-100 border-dashed">
                {game?.status === 'LOBBY' && game?.hostId === socket?.id ? (
                  <button onClick={startGame} className="w-full bg-green-500 text-white py-3 rounded-xl font-bold hover:bg-green-600 shadow-[0_4px_0_rgb(22,163,74)] active:shadow-none active:translate-y-[4px] transition-all border-2 border-green-600">Start Game 🚀</button>
                ) : (game?.status === 'LOBBY' &&
                  <div className="text-center text-gray-400 text-sm italic py-2">Waiting for host...</div>
                )}

                <button onClick={() => location.reload()} className="w-full bg-red-100 text-red-600 py-3 rounded-xl font-bold hover:bg-red-200 text-sm border-2 border-red-200 transition-colors flex items-center justify-center gap-2 group">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 5h7c.552 0 1-.448 1-1s-.448-1-1-1H5c-1.103 0-2 .897-2 2v14c0 1.103.897 2 2 2h7c.552 0 1-.448 1-1s-.448-1-1-1H5V5z" />
                    <path d="m20.293 11.293-4-4a1 1 0 0 0-1.414 1.414L17.586 11H9c-.552 0-1 .448-1 1s.448 1 1 1h8.586l-2.707 2.293a1 1 0 1 0 1.414 1.414l4-4a1 1 0 0 0 0-1.414z" />
                  </svg>
                  Leave Room
                </button>
              </div>
            </div>

            {/* Center: Canvas & Game Area */}
            <div className="bg-white p-1 rounded-xl lg:rounded-3xl shadow-xl flex-1 w-full sketch-border relative flex flex-col min-h-0 overflow-hidden shrink-0 order-first lg:order-none z-0">



              {/* Desktop Header */}
              <div className="hidden lg:flex bg-gray-100 p-2 rounded-t-3xl justify-between items-center px-4 border-b z-10 shrink-0">
                <div className="text-lg flex flex-col leading-tight">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Room: <span className="text-black">{game?.roomId}</span></span>
                    <button onClick={copyRoomId} className="bg-white border border-gray-300 rounded px-1.5 py-0.5 hover:bg-gray-50 text-[10px] uppercase font-bold text-gray-500 shadow-sm active:translate-y-px transition-all" title="Copy Room ID">
                      📋 Copy
                    </button>
                  </div>
                  <span className="text-sm text-gray-500 font-bold">{game?.status === 'LOBBY' ? 'Waiting to Start' : `Round ${game?.currentRound} / ${game?.maxRounds}`}</span>
                  {game?.status === 'DRAWING' && <span className="font-bold text-blue-600 animate-pulse">🎨 {currentDrawerName} is Drawing...</span>}
                </div>
                {game?.status !== 'LOBBY' && (
                  <div className="text-2xl font-bold text-red-500 font-mono bg-white px-3 py-1 rounded shadow-inner">
                    {timeLeft}s
                  </div>
                )}
                <div className="text-xl font-bold uppercase">
                  {renderSecretWord()}
                </div>
              </div>

              {/* Mobile Info Bar (Compact) */}
              <div className="lg:hidden bg-gray-50 p-2 border-b flex justify-between items-center shrink-0 text-xs">
                <div className="flex flex-col gap-1 w-1/3">
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-gray-400">Room: {game?.roomId}</span>
                    <button onClick={copyRoomId} className="bg-white border text-gray-500 rounded px-1 shadow-sm active:scale-95">📋</button>
                  </div>
                  <span className="font-bold text-gray-500">Rd {game?.currentRound}/{game?.maxRounds}</span>
                </div>

                <div className="flex-1 flex justify-center">
                  {renderMobileSecretWord()}
                </div>

                <div className="flex items-center gap-2 justify-end w-1/3">
                  {game?.status === 'DRAWING' && !isDrawer && <span className="text-[10px] text-blue-500 font-bold animate-pulse flex items-center gap-1">🎨 {currentDrawerName}</span>}
                  {game?.status !== 'LOBBY' && <span className="text-xs font-bold text-red-500 bg-white border border-red-200 px-1.5 py-0.5 rounded shadow-sm">{timeLeft}s</span>}
                </div>
              </div>

              <div className="p-1 md:p-4 flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-white">
                {meme && (
                  <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 text-2xl md:text-4xl font-extrabold text-yellow-500 animate-pop-in drop-shadow-md pointer-events-none whitespace-nowrap bg-white/80 px-4 py-2 rounded-full sketch-border rotate-12">
                    {meme}
                  </div>
                )}

                {/* Overlays */}
                {game?.status === 'SELECTING' && isDrawer && (
                  <div className="absolute inset-0 bg-white/95 z-30 flex flex-col items-center justify-center gap-4 p-4 text-center">
                    <h2 className="text-xl md:text-2xl font-bold">Choose a Word!</h2>
                    <div className="flex flex-wrap gap-2 md:gap-4 justify-center">
                      {game.wordOptions.map(word => (
                        <button key={word} onClick={() => selectWord(word)} className="bg-blue-500 text-white px-4 py-2 md:px-6 md:py-3 rounded-lg text-lg md:text-xl font-bold hover:bg-blue-600 transition shadow-lg">
                          {word}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {game?.status === 'SELECTING' && !isDrawer && (
                  <div className="absolute inset-0 bg-white/90 z-20 flex flex-col items-center justify-center gap-4">
                    <h2 className="text-lg md:text-2xl font-bold text-center animate-pulse">{currentDrawerName} is choosing...</h2>
                  </div>
                )}

                {game?.status === 'ENDED' && (
                  <div className="absolute inset-0 bg-black/85 z-50 flex flex-col items-center justify-center gap-4 text-white p-4 text-center backdrop-blur-sm">
                    <h2 className="text-4xl font-bold text-yellow-400 animate-bounce">GAME OVER!</h2>
                    <div className="bg-white text-black p-4 rounded-xl w-full max-w-md shadow-2xl">
                      <h3 className="text-lg font-bold mb-4 border-b pb-2">Final Standings</h3>
                      <div className="space-y-3 max-h-60 overflow-y-auto w-full px-2">
                        {sortedPlayers.map((p, i) => (
                          <div key={p.id} className={`flex flex-col p-2 rounded ${i === 0 ? 'bg-yellow-100 border-2 border-yellow-400' : 'bg-gray-50 border border-gray-200'}`}>
                            <div className="flex justify-between w-full text-base font-hand">
                              <span className="font-bold flex gap-2 items-center">
                                <span>{i === 0 ? '👑' : `#${i + 1}`}</span>
                                {p.name}
                                {socket?.id === p.id && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-200">You</span>}
                              </span>
                              <span className="font-bold">{p.score}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {game.hostId === socket?.id ? (
                      <button onClick={startGame} className="w-full bg-green-500 text-white py-3 rounded-xl font-bold hover:bg-green-600 shadow-md transform hover:scale-105 transition-all">Play Again ↻</button>
                    ) : (
                      <div className="w-full text-center text-white/80 font-bold animate-pulse">Waiting for host to restart...</div>
                    )}
                    <button onClick={() => {
                      // Reset to Create Mode
                      if (socket) {
                        socket.disconnect()
                        socket.connect() // Reconnect fresh
                      }
                      setHasJoined(false)
                      setGame(null)
                      setView('CREATE')
                      setRoomId(generateRoomId())
                    }} className="bg-blue-500 px-8 py-3 rounded-full font-bold hover:bg-blue-600 shadow-xl transition-transform hover:scale-105 border-2 border-blue-400">New Game 🏠</button>
                  </div>
                )}

                <Canvas socket={socket} roomId={roomId} isAllowedToDraw={!!(isDrawer && game?.status === 'DRAWING')} />
              </div>
            </div>

            {/* Mobile Split View: Players + Chat */}
            <div className="flex gap-2 lg:hidden w-full h-48 shrink-0">
              {/* Left: Players (Compact sorted) */}
              <div className="w-1/3 bg-white p-2 rounded-lg sketch-border shadow-sm flex flex-col overflow-hidden">
                <div className="text-xs font-bold border-b pb-1 mb-1 text-center bg-gray-50 flex justify-between items-center px-1">
                  <span>Rankings</span>
                  <button onClick={() => location.reload()} className="text-red-500 hover:bg-red-50 p-1 rounded group" title="Leave Game">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 5h7c.552 0 1-.448 1-1s-.448-1-1-1H5c-1.103 0-2 .897-2 2v14c0 1.103.897 2 2 2h7c.552 0 1-.448 1-1s-.448-1-1-1H5V5z" />
                      <path d="m20.293 11.293-4-4a1 1 0 0 0-1.414 1.414L17.586 11H9c-.552 0-1 .448-1 1s.448 1 1 1h8.586l-2.707 2.293a1 1 0 1 0 1.414 1.414l4-4a1 1 0 0 0 0-1.414z" />
                    </svg>
                  </button>
                </div>



                <ul className="flex-1 overflow-y-auto space-y-1">
                  {sortedPlayers.map((p, i) => (
                    <li key={p.id} className={`flex flex-col p-1 rounded border text-[10px] ${p.guessed ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
                      <div className="flex items-center gap-1">
                        <span className={`font-mono text-[9px] w-3 h-3 flex items-center justify-center rounded-full ${i === 0 ? 'bg-yellow-300' : i === 1 ? 'bg-gray-300' : 'bg-gray-100'}`}>#{i + 1}</span>
                        <img src={p.avatar} alt="Avatar" className="w-6 h-6 object-contain rendering-pixelated" />
                        <span className="font-bold truncate flex items-center gap-1">

                          {p.name}
                          {socket?.id === p.id && <span className="text-[8px] bg-blue-100 text-blue-600 px-1 rounded">You</span>}
                          {game?.hostId === p.id && <span className="text-[8px] bg-orange-100 text-orange-600 px-1 rounded">🏠</span>}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-500 pl-1">
                        <span className="font-mono">{p.score}</span>
                        {p.guessed && <span>✓</span>}
                      </div>
                    </li>
                  ))}
                </ul>
                {game?.status === 'LOBBY' && game?.hostId === socket?.id && (
                  <button onClick={startGame} className="mt-1 text-xs bg-green-500 text-white font-bold py-2 rounded shadow-sm hover:bg-green-600 animate-pulse">Start Game 🚀</button>
                )}
              </div>

              {/* Right: Chat */}
              <div className="w-2/3 bg-white p-2 rounded-lg sketch-border shadow-sm flex flex-col overflow-hidden relative">
                <Chat
                  socket={socket}
                  roomId={roomId}
                  username={username}
                  isDrawer={!!isDrawer}
                  isDrawing={game?.status === 'DRAWING'}
                />
              </div>
            </div>

            {/* Desktop Right Sidebar (Chat) */}
            <div className="hidden lg:flex w-72 mt-0 h-full shrink-0 z-0">
              <div className="sketch-border bg-white p-2 lg:p-3 h-full flex flex-col shadow-lg relative min-h-0">
                <div className="absolute -right-2 top-10 w-8 h-24 bg-gray-200 rounded-r-md border-l border-gray-300 hidden lg:block"></div>
                {/* Mobile Chat Header is minimal */}
                <div className="hidden lg:flex mb-2 items-center gap-2 border-b-2 border-gray-200 pb-2 shrink-0">
                  <img src={avatar} alt="Your Avatar" className="w-10 h-10 object-contain rendering-pixelated" />
                  <span className="font-bold text-lg truncate font-hand">{username}</span>
                </div>


                <div className="flex-1 min-h-0 relative text-xs lg:text-base">
                  <Chat
                    socket={socket}
                    roomId={roomId}
                    username={username}
                    isDrawer={!!isDrawer}
                    isDrawing={game?.status === 'DRAWING'}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
