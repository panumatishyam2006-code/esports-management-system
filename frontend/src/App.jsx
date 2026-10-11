import React, { useState, useEffect, useCallback } from 'react'
import { api } from './api'
import './App.css'
import {
  Trophy,
  Swords,
  Users,
  Calendar,
  Flame,
  Shield,
  Crown,
  Gamepad2,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  Plus,
  LogOut,
  LogIn,
  ChevronRight,
  ArrowLeft,
  Activity,
  Award,
  Zap,
  AlertTriangle,
  Trash2,
  ShieldAlert,
} from 'lucide-react'

export default function App() {
  // Auth state
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Navigation state
  const [currentView, setCurrentView] = useState('tournaments') // 'tournaments' | 'detail' | 'leaderboard'
  const [selectedTournamentId, setSelectedTournamentId] = useState(null)

  // Data states

  // Admin state
  const [adminUsersModal, setAdminUsersModal] = useState(false)
  const [adminUsers, setAdminUsers] = useState([])
  const [adminUsersLoading, setAdminUsersLoading] = useState(false)
  const [stats, setStats] = useState(null)
  const [tournaments, setTournaments] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [tournamentDetail, setTournamentDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTab, setDetailTab] = useState('standings') // 'standings' | 'fixtures' | 'roster'

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'open' | 'ongoing' | 'completed'

  // Modals
  const [authModal, setAuthModal] = useState({ open: false, mode: 'login' })
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '', role: 'player' })
  const [createModal, setCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    game: '',
    description: '',
    start_date: new Date().toISOString().split('T')[0],
    max_players: 8,
  })
  const [scoreModal, setScoreModal] = useState(null) // { matchId, name1, name2, score1, score2 }
  const [playerModal, setPlayerModal] = useState(null) // { username, data }
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: '',
    description: '',
    detail: null,
    confirmText: 'Confirm',
    confirmType: 'primary',
    icon: 'shield',
    onConfirm: null,
  })

  // Toast feedback
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3800)
  }, [])

  // Check current session
  const checkAuth = useCallback(async () => {
    try {
      const data = await api.getMe()
      setUser(data.user)
    } catch (_e) {
      setUser(null)
    } finally {
      setAuthLoading(false)
    }
  }, [])

  // Load stats and tournament list
  const loadInitialData = useCallback(async () => {
    try {
      const [statsData, tournsData, leaderData] = await Promise.all([
        api.getStats().catch(() => null),
        api.getTournaments().catch(() => []),
        api.getLeaderboard().catch(() => []),
      ])
      if (statsData) setStats(statsData)
      setTournaments(tournsData)
      setLeaderboard(leaderData)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    checkAuth()
    loadInitialData()
  }, [checkAuth, loadInitialData])

  // Load specific tournament details
  const loadTournamentDetail = useCallback(async (id) => {
    setDetailLoading(true)
    try {
      const data = await api.getTournament(id)
      if (data.ok) {
        setTournamentDetail(data)
      } else {
        showToast(data.error || 'Failed to load tournament', 'error')
      }
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setDetailLoading(false)
    }
  }, [showToast])

  const openTournament = (id) => {
    setSelectedTournamentId(id)
    setCurrentView('detail')
    setDetailTab('standings')
    loadTournamentDetail(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Admin User Directory
  const loadAdminUsers = useCallback(async () => {
    setAdminUsersLoading(true)
    try {
      const res = await api.getAdminUsers()
      if (res.ok) setAdminUsers(res.users)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setAdminUsersLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (adminUsersModal && user?.role === 'admin') {
      loadAdminUsers()
    }
  }, [adminUsersModal, user, loadAdminUsers])

  const promptDeleteUser = (u) => {
    setConfirmModal({
      open: true,
      title: 'Delete User Account?',
      description: `Permanently delete account "${u.username}" (${u.role})? All tournaments and match records associated with this account will be purged.`,
      detail: {
        Username: u.username,
        Email: u.email,
        Role: u.role,
      },
      confirmText: 'Delete User',
      confirmType: 'danger',
      icon: 'danger',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }))
        try {
          const res = await api.deleteUser(u.id)
          showToast(res.message || 'User deleted', 'ok')
          loadAdminUsers()
          loadInitialData()
        } catch (e) {
          showToast(e.message, 'error')
        }
      },
    })
  }

  // Delete Tournament Action & Confirmation Dialog
  const handleDeleteTournament = async (tournamentId) => {
    const id = tournamentId || selectedTournamentId
    try {
      const res = await api.deleteTournament(id)
      showToast(res.message || 'Tournament deleted successfully.', 'ok')
      if (selectedTournamentId === id) {
        setSelectedTournamentId(null)
        setTournamentDetail(null)
        setCurrentView('tournaments')
      }
      loadInitialData()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const promptDeleteTournament = (targetTournament) => {
    const t = targetTournament || tournamentDetail?.tournament
    if (!t) return
    setConfirmModal({
      open: true,
      title: 'Delete Tournament?',
      description: `Are you sure you want to permanently delete "${t.name}"? All matches, fixtures, standings, and player registrations for this tournament will be permanently erased. This action cannot be undone.`,
      detail: {
        Tournament: t.name,
        Game: t.game,
        Status: t.status,
      },
      confirmText: 'Delete Tournament',
      confirmType: 'danger',
      icon: 'danger',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }))
        await handleDeleteTournament(t.id)
      },
    })
  }

  // Handle Auth submit
  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    try {
      if (authModal.mode === 'login') {
        const res = await api.login(authForm.username, authForm.password)
        if (res.ok) {
          setUser(res.user)
          setAuthModal({ open: false, mode: 'login' })
          showToast(`Welcome back, ${res.user.username}!`, 'ok')
        }
      } else {
        const res = await api.register(authForm.username, authForm.email, authForm.password, authForm.role)
        if (res.ok) {
          setUser(res.user)
          setAuthModal({ open: false, mode: 'login' })
          showToast(`Registration successful! Welcome, ${res.user.username}!`, 'ok')
        }
      }
      loadInitialData()
      if (selectedTournamentId) loadTournamentDetail(selectedTournamentId)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleLogout = async () => {
    try {
      await api.logout()
      setUser(null)
      showToast('You have logged out.', 'ok')
      loadInitialData()
      if (selectedTournamentId) loadTournamentDetail(selectedTournamentId)
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  // Handle Enrollment
  const handleEnroll = async () => {
    if (!user) {
      setAuthModal({ open: true, mode: 'login' })
      return
    }
    try {
      const res = await api.enroll(selectedTournamentId)
      showToast(res.message || 'Enrolled!', 'ok')
      loadTournamentDetail(selectedTournamentId)
      loadInitialData()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const handleLeave = async () => {
    try {
      const res = await api.leave(selectedTournamentId)
      showToast(res.message || 'You left the tournament.', 'ok')
      loadTournamentDetail(selectedTournamentId)
      loadInitialData()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const handleStartTournament = async () => {
    try {
      const res = await api.startTournament(selectedTournamentId)
      showToast(res.message || 'Tournament started!', 'ok')
      loadTournamentDetail(selectedTournamentId)
      loadInitialData()
      setDetailTab('fixtures')
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const handleRemovePlayer = async (userId) => {
    try {
      const res = await api.removePlayer(selectedTournamentId, userId)
      showToast(res.message || 'Player removed.', 'ok')
      loadTournamentDetail(selectedTournamentId)
      loadInitialData()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  // Fault tolerance: confirmation prompts
  const promptEnroll = () => {
    if (!user) {
      setAuthModal({ open: true, mode: 'login' })
      return
    }
    if (user.role !== 'player') {
      showToast('Only player accounts can enroll in tournaments.', 'error')
      return
    }
    if (tournamentDetail.players.length >= tournamentDetail.tournament.max_players) {
      showToast('This tournament is already at maximum capacity.', 'error')
      return
    }

    setConfirmModal({
      open: true,
      title: 'Confirm Championship Enrollment',
      description: `You are about to register for "${tournamentDetail.tournament.name}". Once confirmed, your handle will be placed on the contender roster and round-robin fixtures will be scheduled.`,
      detail: {
        Championship: tournamentDetail.tournament.name,
        Game: tournamentDetail.tournament.game,
        'Start Date': tournamentDetail.tournament.start_date,
        'Contender Handle': user.username,
        'Remaining Slots': `${tournamentDetail.tournament.max_players - tournamentDetail.players.length} left`,
      },
      confirmText: 'Confirm & Enroll',
      confirmType: 'cyan',
      icon: 'shield',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }))
        await handleEnroll()
      },
    })
  }

  const promptLeave = () => {
    setConfirmModal({
      open: true,
      title: 'Withdraw from Championship?',
      description: `Are you sure you want to withdraw from "${tournamentDetail.tournament.name}"? Your reserved contender slot will be surrendered and opened to others.`,
      detail: {
        Championship: tournamentDetail.tournament.name,
        Contender: user?.username || 'You',
        'Current Slots': `${tournamentDetail.players.length} / ${tournamentDetail.tournament.max_players}`,
      },
      confirmText: 'Yes, Withdraw',
      confirmType: 'danger',
      icon: 'alert',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }))
        await handleLeave()
      },
    })
  }

  const promptRemovePlayer = (p) => {
    setConfirmModal({
      open: true,
      title: 'Remove Contender?',
      description: `Are you sure you want to remove contender "${p.username}" from "${tournamentDetail.tournament.name}"? This action will revoke their entry and open up their slot.`,
      detail: {
        'Contender Handle': p.username,
        Email: p.email,
        Tournament: tournamentDetail.tournament.name,
      },
      confirmText: 'Remove Player',
      confirmType: 'danger',
      icon: 'danger',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }))
        await handleRemovePlayer(p.id)
      },
    })
  }

  const promptStartTournament = () => {
    if (tournamentDetail.players.length < 2) {
      showToast('At least 2 players must be enrolled before you can start.', 'error')
      return
    }

    const roundCount =
      tournamentDetail.players.length % 2 === 0
        ? tournamentDetail.players.length - 1
        : tournamentDetail.players.length

    setConfirmModal({
      open: true,
      title: 'Start Championship & Generate Fixtures?',
      description: `Starting "${tournamentDetail.tournament.name}" will lock all entries, generate official round-robin pairings across ${roundCount} rounds, and move tournament status to Ongoing. This action cannot be reversed.`,
      detail: {
        Championship: tournamentDetail.tournament.name,
        'Enrolled Contenders': `${tournamentDetail.players.length} players`,
        'Total Rounds': `${roundCount} rounds`,
        Format: 'Round-Robin (Circle Method)',
      },
      confirmText: 'Start Championship',
      confirmType: 'primary',
      icon: 'trophy',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }))
        await handleStartTournament()
      },
    })
  }

  const handleScoreSubmit = async (e) => {
    e.preventDefault()
    if (!scoreModal) return
    try {
      const res = await api.recordScore(scoreModal.matchId, scoreModal.score1, scoreModal.score2)
      showToast(res.message || 'Score saved!', 'ok')
      setScoreModal(null)
      loadTournamentDetail(selectedTournamentId)
      loadInitialData()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const handleCreateTournament = async (e) => {
    e.preventDefault()
    try {
      const res = await api.createTournament(createForm)
      if (res.ok) {
        showToast('Tournament created successfully!', 'ok')
        setCreateModal(false)
        loadInitialData()
        openTournament(res.id)
      }
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const openPlayerProfile = async (username) => {
    try {
      const data = await api.getPlayer(username)
      if (data.ok) {
        setPlayerModal(data)
      } else {
        showToast('Player profile not found', 'error')
      }
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  // Filtered Tournaments
  const filteredTournaments = tournaments.filter((t) => {
    const matchesQuery =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.game.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.organizer.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter
    return matchesQuery && matchesStatus
  })

  return (
    <div className="app-container">
      {/* ---------------- Toast Notifications ---------------- */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.type === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* ---------------- Navigation Bar ---------------- */}
      <nav className="navbar">
        <div className="container nav-container">
          <div
            className="brand-logo"
            onClick={() => {
              setCurrentView('tournaments')
              setSelectedTournamentId(null)
            }}
          >
            <div className="brand-icon-box">
              <Swords size={22} />
            </div>
            <div>
              <div className="brand-title">NEXUS</div>
              <div className="brand-sub">Esports Championship</div>
            </div>
          </div>

          <div className="nav-links">
            <button
              className={`nav-link-btn ${currentView === 'tournaments' ? 'active' : ''}`}
              onClick={() => {
                setCurrentView('tournaments')
                setSelectedTournamentId(null)
              }}
            >
              <Gamepad2 size={16} />
              <span>Tournaments</span>
            </button>
            <button
              className={`nav-link-btn ${currentView === 'leaderboard' ? 'active' : ''}`}
              onClick={() => {
                setCurrentView('leaderboard')
                setSelectedTournamentId(null)
              }}
            >
              <Trophy size={16} />
              <span>Leaderboard</span>
            </button>
          </div>

          <div className="nav-actions">
            {(user?.role === 'organizer' || user?.role === 'admin') && (
              <button className="btn btn-primary btn-sm" onClick={() => setCreateModal(true)}>
                <Plus size={16} />
                <span>Host Tournament</span>
              </button>
            )}

            {user ? (
              <div className="user-pill">
                <div className="user-avatar-small">{user.username.charAt(0).toUpperCase()}</div>
                <div className="user-info-text">
                  <span className="user-name">{user.username}</span>
                  <span className={`user-role-label ${user.role === 'admin' ? 'role-admin' : ''}`}>{user.role}</span>
                </div>
                {user.role === 'admin' && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ marginLeft: '6px', padding: '3px 8px', fontSize: '0.74rem' }}
                    onClick={() => setAdminUsersModal(true)}
                    title="Super Admin Directory"
                  >
                    <Users size={12} />
                    <span>Users</span>
                  </button>
                )}
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '4px 8px', borderRadius: '50%' }}
                  title="Logout"
                  onClick={handleLogout}
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <button
                className="btn btn-cyan btn-sm"
                onClick={() => setAuthModal({ open: true, mode: 'login' })}
              >
                <LogIn size={15} />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ---------------- Main Content ---------------- */}
      <main className="container" style={{ flex: 1, paddingBottom: '60px' }}>

        {/* VIEW 1: TOURNAMENTS LIST */}
        {currentView === 'tournaments' && (
          <div>
            {/* Hero Banner */}
            <div className="hero-section">
              <img src="/hero-banner.jpg" alt="Arena Stadium" className="hero-bg-img" />
              <div className="hero-overlay" />
              <div className="hero-content">
                <div className="hero-eyebrow">
                  <Flame size={14} />
                  <span>Next-Gen Competitive Platform</span>
                </div>
                <h1 className="hero-title">
                  THE ARENA <span>AWAITS</span>
                </h1>
                <p className="hero-subtitle">
                  Compete in round-robin championships, earn prestige points, and dominate the global rankings.
                </p>

                {stats && (
                  <div className="hero-stats-bar">
                    <div className="hero-stat-item">
                      <span className="hero-stat-num">{stats.total_tournaments}</span>
                      <span className="hero-stat-label">Tournaments</span>
                    </div>
                    <div className="hero-stat-item">
                      <span className="hero-stat-num">{stats.matches_played}</span>
                      <span className="hero-stat-label">Matches Completed</span>
                    </div>
                    <div className="hero-stat-item">
                      <span className="hero-stat-num">{stats.total_players}</span>
                      <span className="hero-stat-label">Active Contenders</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="controls-bar">
              <div className="search-box">
                <Search size={18} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search tournaments, games, or organizers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>

              <div className="filter-pills">
                {['all', 'open', 'ongoing', 'completed'].map((status) => (
                  <button
                    key={status}
                    className={`filter-pill ${statusFilter === status ? 'active' : ''}`}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Tournament Grid */}
            {filteredTournaments.length === 0 ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <Shield size={48} className="text-muted" style={{ margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: '1.4rem', color: '#fff', marginBottom: '8px' }}>No tournaments found</h3>
                <p className="text-muted">Try adjusting your search criteria or create a new tournament.</p>
              </div>
            ) : (
              <div className="tournaments-grid">
                {filteredTournaments.map((t) => (
                  <div
                    key={t.id}
                    className="glass-card glass-card-hover tournament-card"
                    onClick={() => openTournament(t.id)}
                  >
                    <div>
                      <div className="card-top">
                        <span className="game-tag">
                          <Gamepad2 size={14} />
                          {t.game}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`badge badge-${t.status}`}>
                            <span className="badge-dot" />
                            {t.status}
                          </span>
                          {user && (user.role === 'admin' || (user.role === 'organizer' && user.id === t.organizer_id)) && (
                            <button
                              type="button"
                              className="btn-card-delete"
                              title="Delete tournament"
                              onClick={(e) => {
                                e.stopPropagation()
                                promptDeleteTournament(t)
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                      <h3 className="tournament-title">{t.name}</h3>
                      <p className="tournament-desc">{t.description || 'No description provided.'}</p>
                    </div>

                    <div>
                      <div className="capacity-container">
                        <div className="capacity-meta">
                          <span>Contenders Enrolled</span>
                          <span>
                            {t.players} / {t.max_players}
                          </span>
                        </div>
                        <div className="capacity-bar">
                          <div
                            className="capacity-fill"
                            style={{ width: `${Math.min(100, (t.players / t.max_players) * 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="card-footer">
                        <div className="organizer-info">
                          <Crown size={14} className="text-amber" />
                          <span>{t.organizer}</span>
                        </div>
                        <div className="organizer-info">
                          <Calendar size={14} />
                          <span>{t.start_date}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: TOURNAMENT DETAIL */}
        {currentView === 'detail' && (
          <div>
            <div className="detail-header">
              <button className="back-btn" onClick={() => setCurrentView('tournaments')}>
                <ArrowLeft size={16} />
                <span>Back to Tournaments</span>
              </button>

              {detailLoading || !tournamentDetail ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '60px' }}>
                  <Activity size={32} className="text-cyan" style={{ animation: 'pulse-glow 1.5s infinite' }} />
                  <p style={{ marginTop: '12px' }}>Loading championship telemetry...</p>
                </div>
              ) : (
                <div>
                  <div className="glass-card detail-banner" style={{ marginBottom: '24px' }}>
                    <div className="detail-title-area">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span className="game-tag">
                          <Gamepad2 size={15} />
                          {tournamentDetail.tournament.game}
                        </span>
                        <span className={`badge badge-${tournamentDetail.tournament.status}`}>
                          <span className="badge-dot" />
                          {tournamentDetail.tournament.status}
                        </span>
                      </div>
                      <h1 className="detail-title">{tournamentDetail.tournament.name}</h1>
                      <div className="detail-meta-row">
                        <span>
                          <strong>Organizer:</strong> {tournamentDetail.tournament.organizer}
                        </span>
                        <span>•</span>
                        <span>
                          <strong>Starts:</strong> {tournamentDetail.tournament.start_date}
                        </span>
                        <span>•</span>
                        <span>
                          <strong>Slots:</strong> {tournamentDetail.players.length} / {tournamentDetail.tournament.max_players}
                        </span>
                      </div>
                      {tournamentDetail.tournament.description && (
                        <p style={{ color: 'var(--text-muted)', marginTop: '12px', fontSize: '0.94rem' }}>
                          {tournamentDetail.tournament.description}
                        </p>
                      )}
                    </div>

                    <div className="detail-actions-area">
                      {/* If tournament registration is open */}
                      {tournamentDetail.tournament.status === 'open' ? (
                        <>
                          {/* 1. Guest user */}
                          {!user && (
                            <button
                              className="btn btn-cyan btn-lg"
                              onClick={() => {
                                showToast('Please sign in with a player account to enroll.', 'error')
                                setAuthModal({ open: true, mode: 'login' })
                              }}
                            >
                              <LogIn size={18} />
                              <span>Sign In to Enroll</span>
                            </button>
                          )}
                          {/* 2. Organizer account */}
                          {user && user.role === 'organizer' && !tournamentDetail.is_owner && (
                            <span style={{ fontSize: '0.84rem', color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <AlertCircle size={14} />
                              <span>Organizers manage tournaments. Sign in with a player account to enroll as a competitor.</span>
                            </span>
                          )}

                          {/* 3. Player: Already enrolled */}
                          {user && user.role === 'player' && tournamentDetail.enrolled && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              <span className="badge badge-ongoing" style={{ fontSize: '0.84rem', padding: '6px 14px' }}>
                                <CheckCircle2 size={14} /> Enrolled Contender
                              </span>
                              <button className="btn btn-danger" onClick={promptLeave}>
                                Leave Tournament
                              </button>
                            </div>
                          )}

                          {/* 4. Player: Not yet enrolled */}
                          {user && user.role === 'player' && !tournamentDetail.enrolled && (
                            <>
                              {tournamentDetail.players.length >= tournamentDetail.tournament.max_players ? (
                                <button
                                  className="btn btn-secondary btn-lg"
                                  onClick={() =>
                                    showToast(
                                      `Tournament is full (${tournamentDetail.players.length}/${tournamentDetail.tournament.max_players} contenders).`,
                                      'error'
                                    )
                                  }
                                >
                                  <AlertCircle size={18} className="text-amber" />
                                  <span>Tournament Full ({tournamentDetail.players.length}/{tournamentDetail.tournament.max_players})</span>
                                </button>
                              ) : (
                                <button className="btn btn-cyan btn-lg" onClick={promptEnroll}>
                                  <Shield size={18} />
                                  <span>
                                    Enroll in Championship ({tournamentDetail.tournament.max_players - tournamentDetail.players.length} slots left)
                                  </span>
                                </button>
                              )}
                            </>
                          )}

                          {/* 5. Organizer actions */}
                          {tournamentDetail.is_owner && (
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <button
                                className="btn btn-primary btn-lg"
                                disabled={tournamentDetail.players.length < 2}
                                onClick={promptStartTournament}
                                title={
                                  tournamentDetail.players.length < 2
                                    ? 'At least 2 players required to start'
                                    : 'Generate round-robin fixtures'
                                }
                              >
                                <Zap size={18} />
                                <span>Start Tournament</span>
                              </button>
                              <button
                                className="btn btn-danger btn-lg"
                                onClick={() => promptDeleteTournament()}
                                title="Permanently delete this tournament"
                              >
                                <Trash2 size={18} />
                                <span>Delete Tournament</span>
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className="badge badge-completed" style={{ fontSize: '0.88rem', padding: '8px 16px' }}>
                            {tournamentDetail.tournament.status === 'ongoing' ? 'Championship In Progress' : 'Championship Concluded'}
                          </span>
                          {tournamentDetail.is_owner && (
                            <button
                              className="btn btn-danger btn-lg"
                              onClick={() => promptDeleteTournament()}
                              title="Permanently delete this tournament"
                            >
                              <Trash2 size={18} />
                              <span>Delete Tournament</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="tabs-header">
                    <button
                      className={`tab-btn ${detailTab === 'standings' ? 'active' : ''}`}
                      onClick={() => setDetailTab('standings')}
                    >
                      <Trophy size={18} />
                      <span>Standings & Points Table</span>
                    </button>
                    <button
                      className={`tab-btn ${detailTab === 'fixtures' ? 'active' : ''}`}
                      onClick={() => setDetailTab('fixtures')}
                    >
                      <Swords size={18} />
                      <span>Fixtures & Results ({tournamentDetail.matches.length})</span>
                    </button>
                    <button
                      className={`tab-btn ${detailTab === 'roster' ? 'active' : ''}`}
                      onClick={() => setDetailTab('roster')}
                    >
                      <Users size={18} />
                      <span>Enrolled Contenders ({tournamentDetail.players.length})</span>
                    </button>
                  </div>

                  {/* TAB 1: STANDINGS */}
                  {detailTab === 'standings' && (
                    <div className="glass-card">
                      <div className="table-responsive">
                        <table className="nexus-table">
                          <thead>
                            <tr>
                              <th style={{ width: '60px' }}>Rank</th>
                              <th>Contender</th>
                              <th style={{ textAlign: 'center' }}>Played</th>
                              <th style={{ textAlign: 'center' }}>W</th>
                              <th style={{ textAlign: 'center' }}>D</th>
                              <th style={{ textAlign: 'center' }}>L</th>
                              <th style={{ textAlign: 'center' }}>GF</th>
                              <th style={{ textAlign: 'center' }}>GA</th>
                              <th style={{ textAlign: 'center' }}>Diff</th>
                              <th style={{ textAlign: 'center', color: 'var(--cyan)' }}>Points</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tournamentDetail.standings.map((row) => (
                              <tr key={row.id}>
                                <td>
                                  <span className={`rank-badge ${row.rank <= 3 ? `rank-${row.rank}` : 'rank-other'}`}>
                                    {row.rank}
                                  </span>
                                </td>
                                <td>
                                  <span
                                    style={{ fontWeight: '700', cursor: 'pointer', color: '#fff' }}
                                    onClick={() => openPlayerProfile(row.username)}
                                    title="View player profile"
                                  >
                                    {row.username}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>{row.played}</td>
                                <td style={{ textAlign: 'center', color: '#34d399', fontWeight: '600' }}>{row.wins}</td>
                                <td style={{ textAlign: 'center', color: '#94a3b8' }}>{row.draws}</td>
                                <td style={{ textAlign: 'center', color: '#f87171' }}>{row.losses}</td>
                                <td style={{ textAlign: 'center' }}>{row.gf}</td>
                                <td style={{ textAlign: 'center' }}>{row.ga}</td>
                                <td
                                  style={{
                                    textAlign: 'center',
                                    color: row.diff > 0 ? '#34d399' : row.diff < 0 ? '#f87171' : 'inherit',
                                  }}
                                >
                                  {row.diff > 0 ? `+${row.diff}` : row.diff}
                                </td>
                                <td
                                  style={{
                                    textAlign: 'center',
                                    fontWeight: '800',
                                    fontSize: '1.1rem',
                                    color: 'var(--cyan)',
                                  }}
                                >
                                  {row.points}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: FIXTURES */}
                  {detailTab === 'fixtures' && (
                    <div>
                      {Object.keys(tournamentDetail.rounds).length === 0 ? (
                        <div className="glass-card" style={{ textAlign: 'center', padding: '50px' }}>
                          <Swords size={40} className="text-muted" style={{ margin: '0 auto 14px' }} />
                          <h3 style={{ color: '#fff' }}>No fixtures generated yet</h3>
                          <p className="text-muted" style={{ marginTop: '6px' }}>
                            {tournamentDetail.tournament.status === 'open'
                              ? 'The organizer will generate round-robin fixtures once registration closes.'
                              : 'No matches found.'}
                          </p>
                        </div>
                      ) : (
                        Object.entries(tournamentDetail.rounds).map(([roundNum, matches]) => (
                          <div key={roundNum} className="round-section">
                            <h3 className="round-title">
                              <Shield size={18} className="text-cyan" />
                              <span>Round {roundNum}</span>
                            </h3>

                            <div className="matches-grid">
                              {matches.map((m) => (
                                <div key={m.id} className="match-card">
                                  <div className="match-header">
                                    <span>Match #{m.id}</span>
                                    <span className={`badge ${m.status === 'played' ? 'badge-completed' : 'badge-open'}`}>
                                      {m.status}
                                    </span>
                                  </div>

                                  <div className="match-vs-box">
                                    <div className="match-player">
                                      <div className="match-player-avatar">{m.name1.charAt(0).toUpperCase()}</div>
                                      <span
                                        className="match-player-name"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => openPlayerProfile(m.name1)}
                                      >
                                        {m.name1}
                                      </span>
                                    </div>

                                    <div
                                      className={`match-score-display ${
                                        m.status === 'played'
                                          ? m.score1 > m.score2
                                            ? 'winner-1'
                                            : ''
                                          : ''
                                      }`}
                                    >
                                      {m.status === 'played' ? (
                                        <span>
                                          {m.score1} : {m.score2}
                                        </span>
                                      ) : (
                                        <span className="match-score-vs">VS</span>
                                      )}
                                    </div>

                                    <div className="match-player right">
                                      <div className="match-player-avatar">{m.name2.charAt(0).toUpperCase()}</div>
                                      <span
                                        className="match-player-name"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => openPlayerProfile(m.name2)}
                                      >
                                        {m.name2}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Organizer Record Score Button */}
                                  {tournamentDetail.is_owner && (
                                    <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                                      <button
                                        className="btn btn-secondary btn-sm"
                                        style={{ width: '100%' }}
                                        onClick={() =>
                                          setScoreModal({
                                            matchId: m.id,
                                            name1: m.name1,
                                            name2: m.name2,
                                            score1: m.score1 !== null ? m.score1 : 0,
                                            score2: m.score2 !== null ? m.score2 : 0,
                                          })
                                        }
                                      >
                                        <Award size={14} />
                                        <span>{m.status === 'played' ? 'Update Score' : 'Record Score'}</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* TAB 3: ROSTER */}
                  {detailTab === 'roster' && (
                    <div className="glass-card">
                      <div className="table-responsive">
                        <table className="nexus-table">
                          <thead>
                            <tr>
                              <th style={{ width: '60px' }}>#</th>
                              <th>Contender</th>
                              <th>Email</th>
                              {tournamentDetail.is_owner && tournamentDetail.tournament.status === 'open' && (
                                <th style={{ textAlign: 'right' }}>Action</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {tournamentDetail.players.map((p, idx) => (
                              <tr key={p.id}>
                                <td>{idx + 1}</td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div className="user-avatar-small" style={{ width: '28px', height: '28px' }}>
                                      {p.username.charAt(0).toUpperCase()}
                                    </div>
                                    <span
                                      style={{ fontWeight: '700', cursor: 'pointer' }}
                                      onClick={() => openPlayerProfile(p.username)}
                                    >
                                      {p.username}
                                    </span>
                                  </div>
                                </td>
                                <td style={{ color: 'var(--text-muted)' }}>{p.email}</td>
                                {tournamentDetail.is_owner && tournamentDetail.tournament.status === 'open' && (
                                  <td style={{ textAlign: 'right' }}>
                                    <button
                                      className="btn btn-danger btn-sm"
                                      onClick={() => promptRemovePlayer(p)}
                                    >
                                      Remove
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 3: GLOBAL LEADERBOARD */}
        {currentView === 'leaderboard' && (
          <div>
            <div style={{ textAlign: 'center', margin: '30px 0 20px' }}>
              <div className="badge badge-open" style={{ marginBottom: '10px' }}>
                <Trophy size={14} />
                <span>Global Hall of Fame</span>
              </div>
              <h1 className="hero-title" style={{ fontSize: '2.5rem' }}>
                CHAMPIONSHIP <span>RANKINGS</span>
              </h1>
              <p className="text-muted" style={{ maxWidth: '600px', margin: '0 auto' }}>
                Cumulative standings across all competitive matches. Win = 3 Pts, Draw = 1 Pt.
              </p>
            </div>

            {/* Podium for Top 3 */}
            {leaderboard.length >= 3 && (
              <div className="podium-container">
                {/* 2nd Place */}
                <div className="podium-card podium-2" onClick={() => openPlayerProfile(leaderboard[1].username)}>
                  <div className="podium-avatar">{leaderboard[1].username.charAt(0).toUpperCase()}</div>
                  <div className="rank-badge rank-2" style={{ marginBottom: '6px' }}>
                    2
                  </div>
                  <div className="podium-name">{leaderboard[1].username}</div>
                  <div className="podium-pts">{leaderboard[1].points} PTS</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                    {leaderboard[1].wins}W - {leaderboard[1].draws}D - {leaderboard[1].losses}L
                  </div>
                </div>

                {/* 1st Place */}
                <div className="podium-card podium-1" onClick={() => openPlayerProfile(leaderboard[0].username)}>
                  <Crown size={32} className="podium-crown" />
                  <div className="podium-avatar">{leaderboard[0].username.charAt(0).toUpperCase()}</div>
                  <div className="rank-badge rank-1" style={{ marginBottom: '6px' }}>
                    1
                  </div>
                  <div className="podium-name">{leaderboard[0].username}</div>
                  <div className="podium-pts">{leaderboard[0].points} PTS</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                    {leaderboard[0].wins}W - {leaderboard[0].draws}D - {leaderboard[0].losses}L
                  </div>
                </div>

                {/* 3rd Place */}
                <div className="podium-card podium-3" onClick={() => openPlayerProfile(leaderboard[2].username)}>
                  <div className="podium-avatar">{leaderboard[2].username.charAt(0).toUpperCase()}</div>
                  <div className="rank-badge rank-3" style={{ marginBottom: '6px' }}>
                    3
                  </div>
                  <div className="podium-name">{leaderboard[2].username}</div>
                  <div className="podium-pts">{leaderboard[2].points} PTS</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                    {leaderboard[2].wins}W - {leaderboard[2].draws}D - {leaderboard[2].losses}L
                  </div>
                </div>
              </div>
            )}

            {/* Full Table */}
            <div className="glass-card">
              <div className="table-responsive">
                <table className="nexus-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>Rank</th>
                      <th>Player</th>
                      <th style={{ textAlign: 'center' }}>Played</th>
                      <th style={{ textAlign: 'center' }}>Wins</th>
                      <th style={{ textAlign: 'center' }}>Draws</th>
                      <th style={{ textAlign: 'center' }}>Losses</th>
                      <th style={{ textAlign: 'center' }}>GF</th>
                      <th style={{ textAlign: 'center' }}>GA</th>
                      <th style={{ textAlign: 'center' }}>Diff</th>
                      <th style={{ textAlign: 'center', color: 'var(--cyan)' }}>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span className={`rank-badge ${row.rank <= 3 ? `rank-${row.rank}` : 'rank-other'}`}>
                            {row.rank}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{ fontWeight: '700', cursor: 'pointer', color: '#fff' }}
                            onClick={() => openPlayerProfile(row.username)}
                          >
                            {row.username}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>{row.played}</td>
                        <td style={{ textAlign: 'center', color: '#34d399', fontWeight: '600' }}>{row.wins}</td>
                        <td style={{ textAlign: 'center', color: '#94a3b8' }}>{row.draws}</td>
                        <td style={{ textAlign: 'center', color: '#f87171' }}>{row.losses}</td>
                        <td style={{ textAlign: 'center' }}>{row.gf}</td>
                        <td style={{ textAlign: 'center' }}>{row.ga}</td>
                        <td
                          style={{
                            textAlign: 'center',
                            color: row.diff > 0 ? '#34d399' : row.diff < 0 ? '#f87171' : 'inherit',
                          }}
                        >
                          {row.diff > 0 ? `+${row.diff}` : row.diff}
                        </td>
                        <td
                          style={{
                            textAlign: 'center',
                            fontWeight: '800',
                            fontSize: '1.1rem',
                            color: 'var(--cyan)',
                          }}
                        >
                          {row.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ---------------- MODAL: AUTHENTICATION ---------------- */}
      {authModal.open && (
        <div className="modal-overlay" onClick={() => setAuthModal({ ...authModal, open: false })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAuthModal({ ...authModal, open: false })}>
              <X size={20} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div className="brand-icon-box" style={{ margin: '0 auto 12px' }}>
                <Shield size={24} />
              </div>
              <h2 style={{ fontSize: '1.6rem', color: '#fff' }}>
                {authModal.mode === 'login' ? 'Sign In to Nexus' : 'Create Contender Account'}
              </h2>
              <p className="text-muted" style={{ fontSize: '0.88rem', marginTop: '4px' }}>
                {authModal.mode === 'login'
                  ? 'Access your tournaments, standings, and match reports'
                  : 'Join leagues as a player or host as an organizer'}
              </p>
            </div>

            <form onSubmit={handleAuthSubmit}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. ShadowRider"
                  value={authForm.username}
                  onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
                />
              </div>

              {authModal.mode === 'register' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input
                      type="email"
                      required
                      className="form-input"
                      placeholder="player@example.com"
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Account Role</label>
                    <select
                      className="form-select"
                      value={authForm.role}
                      onChange={(e) => setAuthForm({ ...authForm, role: e.target.value })}
                    >
                      <option value="player">Player (Enroll in Tournaments)</option>
                      <option value="organizer">Organizer (Host & Manage Matches)</option>
                      <option value="admin">Administrator (Full Master Access)</option>
                    </select>
                  </div>
                </>
              )}

              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  required
                  className="form-input"
                  placeholder="••••••••"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }}>
                {authModal.mode === 'login' ? 'Authenticate' : 'Create Account'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.88rem' }}>
              {authModal.mode === 'login' ? (
                <span className="text-muted">
                  Don't have an account?{' '}
                  <a
                    href="#register"
                    style={{ color: 'var(--cyan)', fontWeight: '600' }}
                    onClick={(e) => {
                      e.preventDefault()
                      setAuthModal({ ...authModal, mode: 'register' })
                    }}
                  >
                    Register now
                  </a>
                </span>
              ) : (
                <span className="text-muted">
                  Already registered?{' '}
                  <a
                    href="#login"
                    style={{ color: 'var(--cyan)', fontWeight: '600' }}
                    onClick={(e) => {
                      e.preventDefault()
                      setAuthModal({ ...authModal, mode: 'login' })
                    }}
                  >
                    Sign in here
                  </a>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- MODAL: CREATE TOURNAMENT ---------------- */}
      {createModal && (
        <div className="modal-overlay" onClick={() => setCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setCreateModal(false)}>
              <X size={20} />
            </button>

            <div style={{ marginBottom: '22px' }}>
              <div className="badge badge-open" style={{ marginBottom: '8px' }}>
                <Crown size={14} />
                <span>Host Tournament</span>
              </div>
              <h2 style={{ fontSize: '1.6rem', color: '#fff' }}>New Championship</h2>
            </div>

            <form onSubmit={handleCreateTournament}>
              <div className="form-group">
                <label className="form-label">Tournament Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Winter Apex Invitational"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Game Title</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Rocket League, Valorant, CS2"
                  value={createForm.game}
                  onChange={(e) => setCreateForm({ ...createForm, game: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={createForm.start_date}
                    onChange={(e) => setCreateForm({ ...createForm, start_date: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Max Players (2-64)</label>
                  <input
                    type="number"
                    min="2"
                    max="64"
                    required
                    className="form-input"
                    value={createForm.max_players}
                    onChange={(e) => setCreateForm({ ...createForm, max_players: parseInt(e.target.value, 10) || 2 })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description / Rules</label>
                <textarea
                  className="form-textarea"
                  placeholder="Enter tournament format, prize pool, or guidelines..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>
                Publish & Open Enrollment
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- MODAL: ENTER MATCH RESULT ---------------- */}
      {scoreModal && (
        <div className="modal-overlay" onClick={() => setScoreModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setScoreModal(null)}>
              <X size={20} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div className="badge badge-ongoing" style={{ marginBottom: '8px' }}>
                <Award size={14} />
                <span>Match Result</span>
              </div>
              <h2 style={{ fontSize: '1.5rem', color: '#fff' }}>Official Score Report</h2>
            </div>

            <form onSubmit={handleScoreSubmit}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  background: '#090d16',
                  padding: '24px 16px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-subtle)',
                  marginBottom: '24px',
                }}
              >
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div className="user-avatar-small" style={{ margin: '0 auto 8px', width: '44px', height: '44px' }}>
                    {scoreModal.name1.charAt(0).toUpperCase()}
                  </div>
                  <strong style={{ display: 'block', fontSize: '1.05rem', color: '#fff' }}>{scoreModal.name1}</strong>
                  <input
                    type="number"
                    min="0"
                    required
                    style={{
                      width: '70px',
                      fontSize: '1.8rem',
                      textAlign: 'center',
                      marginTop: '12px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '6px',
                    }}
                    value={scoreModal.score1}
                    onChange={(e) =>
                      setScoreModal({ ...scoreModal, score1: parseInt(e.target.value, 10) || 0 })
                    }
                  />
                </div>

                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', color: 'var(--text-dim)' }}>
                  VS
                </div>

                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div className="user-avatar-small" style={{ margin: '0 auto 8px', width: '44px', height: '44px' }}>
                    {scoreModal.name2.charAt(0).toUpperCase()}
                  </div>
                  <strong style={{ display: 'block', fontSize: '1.05rem', color: '#fff' }}>{scoreModal.name2}</strong>
                  <input
                    type="number"
                    min="0"
                    required
                    style={{
                      width: '70px',
                      fontSize: '1.8rem',
                      textAlign: 'center',
                      marginTop: '12px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '6px',
                    }}
                    value={scoreModal.score2}
                    onChange={(e) =>
                      setScoreModal({ ...scoreModal, score2: parseInt(e.target.value, 10) || 0 })
                    }
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                Save Score & Update Points
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- MODAL: PLAYER PROFILE ---------------- */}
      {playerModal && (
        <div className="modal-overlay" onClick={() => setPlayerModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
            <button className="modal-close" onClick={() => setPlayerModal(null)}>
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
              <div
                className="user-avatar-small"
                style={{
                  width: '56px',
                  height: '56px',
                  fontSize: '1.5rem',
                  background: 'linear-gradient(135deg, #00f0ff 0%, #6366f1 100%)',
                }}
              >
                {playerModal.player.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 style={{ fontSize: '1.7rem', color: '#fff', lineHeight: 1.1 }}>{playerModal.player.username}</h2>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <span className="badge badge-role">Rank #{playerModal.stats.rank || '-'}</span>
                  <span className="badge badge-open">Player Profile</span>
                </div>
              </div>
            </div>

            {/* Performance Stats */}
            <div className="player-stat-grid">
              <div className="player-stat-box">
                <div className="player-stat-val text-cyan">{playerModal.stats.points || 0}</div>
                <div className="player-stat-sub">Total Points</div>
              </div>
              <div className="player-stat-box">
                <div className="player-stat-val">{playerModal.stats.played || 0}</div>
                <div className="player-stat-sub">Matches Played</div>
              </div>
              <div className="player-stat-box">
                <div className="player-stat-val" style={{ color: '#34d399' }}>
                  {playerModal.stats.played
                    ? Math.round((playerModal.stats.wins / playerModal.stats.played) * 100)
                    : 0}
                  %
                </div>
                <div className="player-stat-sub">Win Rate</div>
              </div>
            </div>

            {/* Tournaments Entered */}
            <h4 style={{ fontSize: '1rem', color: '#fff', marginTop: '20px', marginBottom: '10px' }}>
              Championship History ({playerModal.entered.length})
            </h4>
            <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
              {playerModal.entered.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>No tournaments joined yet.</p>
              ) : (
                playerModal.entered.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '6px',
                      marginBottom: '6px',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#fff', fontSize: '0.9rem' }}>{t.name}</strong>
                      <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                        {t.game}
                      </span>
                    </div>
                    <span className={`badge badge-${t.status}`}>{t.status}</span>
                  </div>
                ))
              )}
            </div>

            {/* Recent Match Log */}
            <h4 style={{ fontSize: '1rem', color: '#fff', marginTop: '20px', marginBottom: '10px' }}>
              Recent Matches ({playerModal.recent.length})
            </h4>
            <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
              {playerModal.recent.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>No matches recorded yet.</p>
              ) : (
                playerModal.recent.map((m) => {
                  const isPlayer1 = m.player1_id === playerModal.player.id
                  const myScore = isPlayer1 ? m.score1 : m.score2
                  const oppScore = isPlayer1 ? m.score2 : m.score1
                  const oppName = isPlayer1 ? m.name2 : m.name1
                  const won = myScore > oppScore
                  const drew = myScore === oppScore

                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '6px',
                        marginBottom: '6px',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '0.88rem', color: '#fff' }}>vs {oppName}</span>
                        <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                          {m.tournament}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: '700',
                            fontSize: '1rem',
                            color: '#fff',
                          }}
                        >
                          {myScore} - {oppScore}
                        </span>
                        <span
                          className="badge"
                          style={{
                            background: won ? 'rgba(16, 185, 129, 0.2)' : drew ? 'rgba(148, 163, 184, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                            color: won ? '#34d399' : drew ? '#94a3b8' : '#fb7185',
                          }}
                        >
                          {won ? 'WIN' : drew ? 'DRAW' : 'LOSS'}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      
      {/* ---------------- MODAL: ADMIN USERS DIRECTORY ---------------- */}
      {adminUsersModal && user?.role === 'admin' && (
        <div className="modal-overlay" onClick={() => setAdminUsersModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <button className="modal-close" onClick={() => setAdminUsersModal(false)}>
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div
                className="user-avatar-small"
                style={{
                  width: '48px',
                  height: '48px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                }}
              >
                <ShieldAlert size={24} color="#fff" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.5rem', color: '#fff', lineHeight: 1.1 }}>User Accounts Directory</h2>
                <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                  Super Admin management of all contenders, organizers, and accounts across Nexus.
                </p>
              </div>
            </div>

            {adminUsersLoading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <Activity size={28} className="text-cyan" style={{ animation: 'pulse-glow 1.5s infinite' }} />
                <p style={{ marginTop: '10px' }} className="text-muted">Loading accounts directory...</p>
              </div>
            ) : (
              <div className="table-responsive" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px 12px' }}>Username</th>
                      <th style={{ padding: '8px 12px' }}>Role</th>
                      <th style={{ padding: '8px 12px' }}>Email</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.9rem' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                          <span style={{ color: u.role === 'admin' ? '#fbbf24' : '#fff' }}>{u.username}</span>
                          {u.id === user.id && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>(You)</span>}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className={`badge badge-${u.role === 'admin' ? 'admin' : u.role === 'organizer' ? 'ongoing' : 'open'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.84rem' }}>{u.email}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {u.id !== user.id && (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                              onClick={() => promptDeleteUser(u)}
                            >
                              <Trash2 size={12} />
                              <span>Delete</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- MODAL: CONFIRMATION (FAULT TOLERANCE) ---------------- */}
      {confirmModal.open && (
        <div className="modal-overlay" onClick={() => setConfirmModal({ ...confirmModal, open: false })}>
          <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setConfirmModal({ ...confirmModal, open: false })}>
              <X size={20} />
            </button>

            <div className={`confirm-icon-box confirm-icon-${confirmModal.confirmType}`}>
              {confirmModal.icon === 'danger' && <AlertTriangle size={28} />}
              {confirmModal.icon === 'alert' && <AlertCircle size={28} />}
              {confirmModal.icon === 'shield' && <Shield size={28} />}
              {confirmModal.icon === 'trophy' && <Trophy size={28} />}
            </div>

            <h2 className="confirm-title">{confirmModal.title}</h2>
            <p className="confirm-desc">{confirmModal.description}</p>

            {confirmModal.detail && (
              <div className="confirm-details-card">
                {Object.entries(confirmModal.detail).map(([key, val]) => (
                  <div key={key} className="confirm-detail-row">
                    <span className="confirm-detail-key">{key}</span>
                    <span className="confirm-detail-val">{val}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="confirm-actions-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmModal({ ...confirmModal, open: false })}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn btn-${confirmModal.confirmType}`}
                onClick={confirmModal.onConfirm}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
