import React, { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

interface VoiceChatProps {
    socket: Socket | null;
    roomId: string;
    players: { id: string; name: string }[];
    currentUserId: string;
    gameStatus: string;
}

const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.protocol.org:3478' }
    ]
}

const AudioStreamPlayer = ({ stream, isMuted }: { stream: MediaStream, isMuted: boolean }) => {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current && stream) {
            audioRef.current.srcObject = stream;
            // Handle play with abort safety
            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => console.log("Audio playing for stream:", stream.id))
                    .catch(e => {
                        if (e.name === 'AbortError') {
                            // Ignore AbortError as it means we interrupted a load (expected during frequent updates)
                        } else {
                            console.error("Audio playback failed:", e);
                        }
                    });
            }
        }
    }, [stream]);

    // Re-trigger play if mute state changes to false
    useEffect(() => {
        if (!isMuted && audioRef.current && audioRef.current.paused) {
            audioRef.current.play().catch(e => console.error("Unmute play failed:", e));
        }
    }, [isMuted]);

    return <audio ref={audioRef} autoPlay playsInline muted={isMuted} controls={false} />;
};

const VoiceChat: React.FC<VoiceChatProps> = ({ socket, roomId, players, currentUserId, gameStatus }) => {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(true); // Default: Microphones OFF on entry

    // Visualizer state
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Mute features
    const [isDeafened, setIsDeafened] = useState(true); // Default: Speakers OFF on entry
    const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set());
    // Track remote peers' self-mute state for UI and enforcement
    const [remoteMuteStates, setRemoteMuteStates] = useState<Map<string, { isMuted: boolean, isDeafened: boolean }>>(new Map());
    const [showSettings, setShowSettings] = useState(false);

    // Broadcast initial Mute/Deafen state on join
    useEffect(() => {
        if (socket && roomId) {
            socket.emit('voice-state-change', { roomId, isMuted: true, isDeafened: true });
        }
    }, [socket, roomId]);

    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    // Keep track of who we are connected to, to trigger re-renders
    const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

    useEffect(() => {
        console.log("VoiceChat Init - Socket:", !!socket, "User:", currentUserId);
        if (!socket || !currentUserId) return;

        navigator.mediaDevices.getUserMedia({ video: false, audio: true })
            .then(myStream => {
                console.log("Mic Stream Acquired:", myStream.id);
                setStream(myStream);
            })
            .catch(err => console.error("Mic Error:", err));

        return () => {
            console.log("VoiceChat Cleanup");
            stream?.getTracks().forEach(t => t.stop());
            peersRef.current.forEach(pc => pc.close());
            peersRef.current.clear();
            setConnectedPeers([]);
            setRemoteStreams(new Map());
        }
    }, [roomId, socket]);

    // Audio Analyzer for Visual Feedback
    useEffect(() => {
        if (!stream) return;

        let audioContext: AudioContext;
        let analyser: AnalyserNode;
        let microphone: MediaStreamAudioSourceNode;

        try {
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(stream);

            analyser.smoothingTimeConstant = 0.8;
            analyser.fftSize = 1024;

            microphone.connect(analyser);
        } catch (e) {
            console.error("Audio Context Error", e);
            return;
        }

        let animationFrameId: number;

        const updateVisualizer = () => {
            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);
            const arraySum = array.reduce((a, value) => a + value, 0);
            const average = arraySum / array.length;
            setIsSpeaking(average > 10); // Threshold

            animationFrameId = requestAnimationFrame(updateVisualizer);
        };

        updateVisualizer();

        return () => {
            cancelAnimationFrame(animationFrameId);
            analyser.disconnect();
            microphone.disconnect();
            if (audioContext.state !== 'closed') audioContext.close();
        }
    }, [stream]);

    // Handle Players & Signaling
    useEffect(() => {
        if (!socket || !stream) return;

        // Queue for ICE candidates that arrive before remote description
        const iceQueues = new Map<string, RTCIceCandidate[]>();

        const handleSignal = async ({ signal, sender }: { signal: any, sender: string }) => {
            if (sender === currentUserId) return;

            let pc = peersRef.current.get(sender);

            if (!pc) {
                pc = createPeerConnection(sender);
            }

            try {
                if (signal.type === 'offer') {
                    // If we already have an active connection and it's stable, we might want to ignore or renegotiate
                    // For simple mesh, just accept the offer if we're not the initiator or if we need to reset
                    if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-remote-offer') {
                        // Potential glare, but our ID check (initiator logic) usually handles this.
                        // We'll proceed with standard flow.
                        console.warn("Received offer in non-stable state", pc.signalingState);
                        // If we are stuck, we might want to recreate the PC, but let's try to set it.
                        // Using 'rollback' (if supported) or just overwriting is complex. 
                        // For now, assume this is a fresh or renegotiation offer.
                    }

                    await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

                    // Process any queued candidates
                    const queue = iceQueues.get(sender);
                    if (queue) {
                        while (queue.length > 0) {
                            const candidate = queue.shift();
                            if (candidate) await pc.addIceCandidate(candidate);
                        }
                        iceQueues.delete(sender);
                    }

                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    socket.emit('voice-signal', {
                        target: sender,
                        signal: { type: 'answer', sdp: answer }
                    });

                } else if (signal.type === 'answer') {
                    if (pc.signalingState === 'have-local-offer') {
                        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

                        // Process any queued candidates
                        const queue = iceQueues.get(sender);
                        if (queue) {
                            while (queue.length > 0) {
                                const candidate = queue.shift();
                                if (candidate) await pc.addIceCandidate(candidate);
                            }
                            iceQueues.delete(sender);
                        }
                    } else {
                        console.warn(`Ignored answer in ${pc.signalingState} state`);
                    }

                } else if (signal.candidate) {
                    const candidate = new RTCIceCandidate(signal.candidate);
                    if (pc.remoteDescription && pc.remoteDescription.type) {
                        await pc.addIceCandidate(candidate);
                    } else {
                        // Queue it
                        const queue = iceQueues.get(sender) || [];
                        queue.push(candidate);
                        iceQueues.set(sender, queue);
                    }
                }
            } catch (err) {
                console.error("Signaling Error", err);
            }
        };

        socket.on('voice-signal', handleSignal);

        // Check for new peers
        players.forEach(p => {
            if (p.id === currentUserId) return;
            if (peersRef.current.has(p.id)) return;

            // Logic: Lower ID initiates connection to Higher ID
            // This prevents "Glare" (both trying to offer at same time)
            if (currentUserId < p.id) {
                const pc = createPeerConnection(p.id);
                pc.createOffer().then(offer => {
                    pc.setLocalDescription(offer);
                    socket.emit('voice-signal', {
                        target: p.id,
                        signal: { type: 'offer', sdp: offer }
                    });
                }).catch(e => console.error("Offer Error", e));
            }
        });

        const handleStateChange = (data: { userId: string, isMuted: boolean, isDeafened: boolean }) => {
            setRemoteMuteStates(prev => {
                const newMap = new Map(prev);
                newMap.set(data.userId, { isMuted: data.isMuted, isDeafened: data.isDeafened });
                return newMap;
            });
        };

        socket.on('voice-state-change', handleStateChange);

        return () => {
            socket.off('voice-signal', handleSignal);
            socket.off('voice-state-change', handleStateChange);
        }

    }, [socket, stream, players, currentUserId]);

    // Dedicated Cleanup Effect: Runs immediately when 'players' list changes
    useEffect(() => {
        const activeIds = new Set(players.map(p => p.id));

        peersRef.current.forEach((pc, id) => {
            if (!activeIds.has(id)) {
                console.log(`Player ${id} left, cleaning up connection.`);
                pc.close();
                peersRef.current.delete(id);
                setConnectedPeers(prev => prev.filter(pId => pId !== id));
                setRemoteStreams(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(id);
                    return newMap;
                });
                setRemoteMuteStates(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(id);
                    return newMap;
                });
            }
        });
    }, [players]);

    // Reconciliation Loop: Retry connections that might have failed
    useEffect(() => {
        if (!socket || !stream) return;

        const interval = setInterval(() => {
            players.forEach(p => {
                if (p.id === currentUserId) return;
                // If we should be connected but aren't
                if (!peersRef.current.has(p.id)) {
                    // Only retry if we are the initiator (Lower ID) to avoid glare conflicts
                    if (currentUserId < p.id) {
                        console.log("Retrying connection to", p.name);
                        const pc = createPeerConnection(p.id);
                        pc.createOffer().then(offer => {
                            pc.setLocalDescription(offer);
                            socket.emit('voice-signal', {
                                target: p.id,
                                signal: { type: 'offer', sdp: offer }
                            });
                        }).catch(e => console.error("Retry Offer Error", e));
                    }
                }
            });
        }, 2000); // Check every 2 seconds (Aggressive)

        return () => clearInterval(interval);
    }, [socket, stream, players, currentUserId]);

    const createPeerConnection = (targetId: string) => {
        const pc = new RTCPeerConnection(iceServers);

        peersRef.current.set(targetId, pc);
        setConnectedPeers(prev => {
            if (prev.includes(targetId)) return prev;
            return [...prev, targetId];
        });

        stream?.getTracks().forEach(track => {
            pc.addTrack(track, stream);
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket?.emit('voice-signal', {
                    target: targetId,
                    signal: { candidate: event.candidate }
                });
            }
        };

        pc.ontrack = (event) => {
            console.log(`Received track from ${targetId}:`, event.streams[0]?.id);
            if (event.streams && event.streams[0]) {
                setRemoteStreams(prev => {
                    const newMap = new Map(prev);
                    newMap.set(targetId, event.streams[0]);
                    return newMap;
                });
            }
        };

        // Handle ICE connection state changes for auto-recovery
        pc.oniceconnectionstatechange = () => {
            console.log(`ICE State ${targetId}: ${pc.iceConnectionState}`);
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                console.warn(`Connection to ${targetId} failed/disconnected. Removing to trigger retry.`);
                pc.close();
                peersRef.current.delete(targetId);
                setConnectedPeers(prev => prev.filter(id => id !== targetId));
                setRemoteStreams(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(targetId);
                    return newMap;
                });
                // Reconciliation loop will pick this up in < 2s
            }
        };

        return pc;
    }

    // Auto-Mute/Deafen on Game Start
    useEffect(() => {
        if (gameStatus && gameStatus !== 'LOBBY') {
            // Game Started: Force Mute and Deafen if not already
            if (!isMuted) toggleMute();
            if (!isDeafened) toggleDeafen();
        }
    }, [gameStatus]);

    // Sync Mute State with Stream
    useEffect(() => {
        if (stream) {
            stream.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
            });
        }
    }, [stream, isMuted]);

    const toggleMute = () => {
        const newState = !isMuted;
        setIsMuted(newState);
        socket?.emit('voice-state-change', { roomId, isMuted: newState, isDeafened });
    };

    const toggleDeafen = () => {
        const newState = !isDeafened;
        setIsDeafened(newState);
        socket?.emit('voice-state-change', { roomId, isMuted, isDeafened: newState });
    };

    const toggleMutePeer = (peerId: string) => {
        setMutedPeers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(peerId)) newSet.delete(peerId);
            else newSet.add(peerId);
            return newSet;
        });
    };

    const handleManualReconnect = () => {
        setConnectedPeers([]);
        setRemoteStreams(new Map());
        peersRef.current.forEach(pc => pc.close());
        peersRef.current.clear();
        // Force re-execution by clearing; reconciliation loop will pick it up
    };

    return (
        <div className="w-full flex flex-col bg-white/95 backdrop-blur-md rounded-xl border border-indigo-50 shadow-sm overflow-hidden transition-all duration-300">
            <div
                className="flex justify-between items-center px-2 py-2 cursor-pointer hover:bg-gray-50/50 transition-colors"
                onClick={() => setShowSettings(!showSettings)}
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    <div className={`p-1.5 rounded-full shrink-0 transition-colors ${isSpeaking ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-50 text-indigo-500'}`}>
                        {isSpeaking ? (
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                            </span>
                        ) : (
                            <span className="text-xs">🎧</span>
                        )}
                    </div>
                    <div className="flex flex-col overflow-hidden min-w-0">
                        <span className="text-[10px] font-bold text-gray-700 tracking-wide uppercase truncate">Voice Chat</span>
                        <div className="flex items-center gap-1">
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${connectedPeers.length > 0 ? 'bg-emerald-500' : 'bg-orange-300'}`}></div>
                            <span className="text-[9px] text-gray-500 font-medium truncate">
                                {connectedPeers.length + 1} Active
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    {(isMuted || isDeafened) && (
                        <div className="flex items-center gap-0.5 px-1 py-0.5 bg-red-50 rounded border border-red-100 animate-fade-in shadow-sm">
                            {isMuted && <span className="text-[9px]" title="Muted">🔇</span>}
                            {isDeafened && <span className="text-[9px]" title="Deafened">🔕</span>}
                        </div>
                    )}
                    <div className={`transform transition-transform duration-300 text-gray-400 ${showSettings ? 'rotate-180' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </div>
                </div>
            </div>

            {/* Dropdown Content */}
            {showSettings && (
                <div className="flex flex-col px-2 pb-2 pt-0 gap-2 animate-in slide-in-from-top-2 duration-200">
                    <div className="h-px bg-gray-100 w-full mb-1" />

                    {/* Controls - Stacked for narrow width safety */}
                    {/* Controls - Stacked for narrow width safety */}
                    <div className="flex flex-row gap-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                            className={`flex-1 flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-200 active:scale-95 ${isMuted
                                ? 'bg-red-50 text-red-600 border border-red-100 shadow-sm'
                                : 'bg-indigo-600 text-white shadow-md shadow-indigo-200 hover:bg-indigo-700'
                                }`}
                        >
                            <span>{isMuted ? "Unmute" : "Mute"}</span>
                            <span>{isMuted ? "🔇" : "🎙️"}</span>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleDeafen(); }}
                            className={`flex-1 flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-200 active:scale-95 ${isDeafened
                                ? 'bg-red-50 text-red-600 border border-red-100 shadow-sm'
                                : 'bg-white text-gray-700 border border-gray-200 shadow-sm hover:bg-gray-50'
                                }`}
                        >
                            <span>{isDeafened ? "Undfn" : "Deafen"}</span>
                            <span>{isDeafened ? "🔕" : "🎧"}</span>
                        </button>
                    </div>

                    <button
                        onClick={(e) => { e.stopPropagation(); handleManualReconnect(); }}
                        className="w-full text-[9px] text-center text-gray-400 hover:text-indigo-500 py-1 border border-dashed border-gray-200 rounded hover:bg-indigo-50 transition-colors"
                    >
                        ↻ Reconnect Voice
                    </button>

                    {/* Players List */}
                    <div className="flex flex-col gap-1 mt-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                        <div className="flex justify-between items-center">
                            <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Participants</span>
                        </div>

                        {connectedPeers.length === 0 && players.length > 1 && (
                            <div className="text-center py-2 bg-yellow-50 rounded-lg border border-dashed border-yellow-200">
                                <span className="text-yellow-600 text-[10px] animate-pulse">Connecting...</span>
                            </div>
                        )}
                        {connectedPeers.filter(id => id !== currentUserId).map(id => {
                            const player = players.find(p => p.id === id);
                            const name = player ? player.name : id.slice(0, 8);
                            const isPeerMuted = mutedPeers.has(id);

                            return (
                                <div key={id} className="flex justify-between items-center p-1.5 bg-white rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-[9px] font-bold text-indigo-600 ring-1 ring-white shadow-sm shrink-0">
                                            {name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[10px] font-bold text-gray-700 truncate">{name}</span>
                                            {remoteMuteStates.get(id)?.isMuted && (
                                                <span className="text-[8px] text-red-500 font-bold bg-red-50 px-1 rounded-sm w-fit">MUTED</span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleMutePeer(id); }}
                                        className={`p-1.5 rounded transition-all active:scale-90 ${isPeerMuted
                                            ? 'text-red-500 bg-red-50 hover:bg-red-100'
                                            : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50'
                                            }`}
                                        title={isPeerMuted ? "Unmute Player" : "Mute Player"}
                                    >
                                        {isPeerMuted ? "🔇" : "🔊"}
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Audio Elements (Strictly Filtered) */}
            {Array.from(remoteStreams.entries())
                .filter(([id, s]) => id !== currentUserId && s.id !== stream?.id)
                .map(([id, stream]) => (
                    <AudioStreamPlayer
                        key={id}
                        stream={stream}
                        isMuted={isDeafened || mutedPeers.has(id) || (remoteMuteStates.get(id)?.isMuted ?? false)}
                    />
                ))}
        </div>
    );
};

export default VoiceChat;
