import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ChangeEvent,
  type FormEvent,
} from 'react'

import { createWorker } from 'tesseract.js'

import {
  useEditor,
  EditorContent,
  type JSONContent,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import { Extension } from '@tiptap/core'
import {
  Search,
  Plus,
  Menu,
  X,
  StickyNote,
  Archive,
  ArchiveRestore,
  Settings,
  LogOut,
  ImagePlus,
  FileDown,
  MoreHorizontal,
  Check,
  ArrowLeft,
  PanelLeftClose,
  LoaderCircle,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Trash2,
  ChevronDown,
  Type,
  Moon,
  Sun,
  UserRound,
  RotateCcw,
  Pin,
  HelpCircle,
  Bug,
  Clock,
  Layers,
} from 'lucide-react'

type ApiNote = {
  id: string | number
  title?: string
  content?: unknown
  pinned?: boolean
  archived?: boolean
  deleted?: boolean
  deletedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

type Note = {
  id: string
  title: string
  content: string
  richContent: JSONContent
  pinned: boolean
  archived: boolean
  deleted: boolean
  deletedAt: string | null
  createdAt: number
  updatedAt: number
  isNew?: boolean
}

type AuthUser = {
  userId: string
  name: string
  email: string
  createdAt?: string
  notesCreatedCount?: number
}

type AuthResponse = {
  message?: string
  token?: string
  userId?: string
  name?: string
  email?: string
  createdAt?: string
  notesCreatedCount?: number
}

const API_BASE = 'http://localhost:8080/api'
const TOKEN_KEY = 'notebug-token'
const USER_KEY = 'notebug-user'
const LEGACY_TOKEN_KEY = 'little-notes-token'
const LEGACY_USER_KEY = 'little-notes-user'

function readUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY) || localStorage.getItem(LEGACY_USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY)
}

/**
 * Calculates human-readable account age and member since date.
 */
function formatAccountAge(createdAt?: string): { ageString: string; memberSince: string } {
  if (!createdAt) {
    return { ageString: 'Active member', memberSince: 'Recently' }
  }
  const createdDate = new Date(createdAt)
  const now = new Date()
  if (Number.isNaN(createdDate.getTime())) {
    return { ageString: 'Active member', memberSince: 'Recently' }
  }

  const diffMs = Math.max(0, now.getTime() - createdDate.getTime())
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  let ageString = ''
  if (diffMinutes < 60) {
    ageString = diffMinutes <= 1 ? 'Joined just now' : `${diffMinutes} mins old`
  } else if (diffHours < 24) {
    ageString = diffHours === 1 ? '1 hour old' : `${diffHours} hours old`
  } else if (diffDays === 1) {
    ageString = '1 day old'
  } else if (diffDays < 30) {
    ageString = `${diffDays} days old`
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    ageString = months === 1 ? '1 month old' : `${months} months old`
  } else {
    const years = (diffDays / 365).toFixed(1)
    ageString = `${years} years old`
  }

  const memberSince = createdDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return { ageString, memberSince }
}

/**
 * Calculates remaining days in bin out of 15 days.
 */
function getBinDaysLeft(deletedAt: string | null): number {
  if (!deletedAt) return 15
  const deletedTime = new Date(deletedAt).getTime()
  if (Number.isNaN(deletedTime)) return 15
  const msElapsed = Date.now() - deletedTime
  const daysPassed = Math.floor(msElapsed / (1000 * 60 * 60 * 24))
  return Math.max(0, 15 - daysPassed)
}

/**
 * Allows Tiptap text to carry a font-size attribute.
 */
const FontSize = Extension.create({
  name: 'fontSize',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) =>
              (element as HTMLElement).style.fontSize || null,
            renderHTML: (attributes) =>
              attributes.fontSize
                ? { style: `font-size: ${attributes.fontSize}` }
                : {},
          },
        },
      },
    ]
  },
})

/**
 * Converts a plain string or stored Tiptap JSON into valid editor content.
 */
function normalizeRichContent(value: unknown): JSONContent {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)

      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed as JSONContent).type === 'doc'
      ) {
        return parsed as JSONContent
      }
    } catch {
      // A normal text string is valid fallback content.
    }

    return textToContent(value)
  }

  if (
    value &&
    typeof value === 'object' &&
    (value as JSONContent).type === 'doc'
  ) {
    return value as JSONContent
  }

  return textToContent('')
}

/**
 * Keeps line breaks when older plain-text notes are loaded.
 */
function textToContent(text: string): JSONContent {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  }
}

/**
 * Extracts readable text from stored Tiptap JSON for note cards and search.
 */
function contentToText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (!value || typeof value !== 'object') {
    return ''
  }

  const obj = value as Record<string, unknown>

  if (obj.type === 'text' && typeof obj.text === 'string') {
    return obj.text
  }

  if (obj.type === 'hardBreak') {
    return '\n'
  }

  if (Array.isArray(obj.content)) {
    const children = obj.content as unknown[]

    if (obj.type === 'doc') {
      return children.map(contentToText).join('\n')
    }

    if (obj.type === 'paragraph') {
      return children.map(contentToText).join('')
    }

    return children.map(contentToText).join('')
  }

  return ''
}

function mapApiNote(note: ApiNote): Note {
  const updated = note.updatedAt
    ? new Date(note.updatedAt).getTime()
    : Date.now()
  const created = note.createdAt
    ? new Date(note.createdAt).getTime()
    : Date.now()

  const richContent = normalizeRichContent(note.content)

  return {
    id: String(note.id),
    title: note.title ?? '',
    content: contentToText(richContent),
    richContent,
    pinned: Boolean(note.pinned),
    archived: Boolean(note.archived),
    deleted: Boolean(note.deleted),
    deletedAt: note.deletedAt ?? null,
    createdAt: Number.isNaN(created) ? Date.now() : created,
    updatedAt: Number.isNaN(updated) ? Date.now() : updated,
  }
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  needsAuth = true,
): Promise<T> {
  const token = getStoredToken()

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(needsAuth && token
        ? { Authorization: `Bearer ${token}` }
        : {}),
      ...options.headers,
    },
  })

  if (response.status === 401 && needsAuth) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    localStorage.removeItem(LEGACY_USER_KEY)
    window.dispatchEvent(new Event('notebug-session-expired'))
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`

    try {
      const body = await response.json()
      message = body.message || body.error || message
    } catch {
      // Keep the default message if the response is not JSON.
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

function displayNoteId(id: string): string {
  if (id.startsWith('new-')) {
    return 'New'
  }

  const numeric = Number(id)

  return Number.isFinite(numeric)
    ? String(numeric).padStart(3, '0')
    : id
}

type ViewMode = 'notes' | 'archive' | 'bin' | 'settings'

function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [search, setSearch] = useState('')
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [menuNote, setMenuNote] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [user, setUser] = useState<AuthUser | null>(() => readUser())
  const [currentView, setCurrentView] = useState<ViewMode>('notes')
  const [profileOpen, setProfileOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [emptyBinDialogOpen, setEmptyBinDialogOpen] = useState(false)

  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('notebug-theme') === 'dark' || localStorage.getItem('little-notes-theme') === 'dark',
  )
  const [accountName, setAccountName] = useState(() => readUser()?.name ?? '')
  const [savingAccount, setSavingAccount] = useState(false)
  const [bugReportMessage, setBugReportMessage] = useState('')
  const [sendingBugReport, setSendingBugReport] = useState(false)

  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authName, setAuthName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [authError, setAuthError] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const [totalNotesCreated, setTotalNotesCreated] = useState<number>(() => {
    return readUser()?.notesCreatedCount ?? 0
  })

  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  const [fontFamily, setFontFamily] = useState('Inter')
  const [fontSize, setFontSize] = useState('16px')

  const toastTimer = useRef<number | null>(null)
  const loadedNoteId = useRef<string | null>(null)

  const showToast = useCallback((message: string) => {
    setToast(message)

    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current)
    }

    toastTimer.current = window.setTimeout(() => {
      setToast('')
      toastTimer.current = null
    }, 2800)
  }, [])

  const updateActive = useCallback(
    (field: 'title' | 'content' | 'richContent', value: string | JSONContent) => {
      setActiveNote((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          [field]: value,
          updatedAt: Date.now(),
        }
      })
    },
    [],
  )

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
    ],
    content: textToContent(''),
    editorProps: {
      attributes: {
        class: 'tiptap',
        'aria-label': 'Note content editor',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const richContent = currentEditor.getJSON()
      const plainText = currentEditor.getText({
        blockSeparator: '\n',
      })

      setActiveNote((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          richContent,
          content: plainText,
          updatedAt: Date.now(),
        }
      })
    },
  })

  /**
   * Only load content when switching to a different note.
   */
  useEffect(() => {
    if (!editor) {
      return
    }

    const nextId = activeNote?.id ?? null

    if (nextId === loadedNoteId.current) {
      return
    }

    loadedNoteId.current = nextId

    editor.commands.setContent(
      activeNote?.richContent ?? textToContent(''),
      { emitUpdate: false },
    )

    setFontFamily('Inter')
    setFontSize('16px')
  }, [activeNote?.id, editor])

  const loadNotes = useCallback(async () => {
    if (!getStoredToken()) {
      setNotes([])
      return
    }

    setLoadingNotes(true)

    try {
      const data = await apiRequest<ApiNote[]>('/notes')
      const mapped = Array.isArray(data) ? data.map(mapApiNote) : []
      // Client-side 15-day purge check
      const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000
      const now = Date.now()
      const validNotes = mapped.filter((n) => {
        if (n.deleted && n.deletedAt) {
          const elapsed = now - new Date(n.deletedAt).getTime()
          return elapsed < fifteenDaysMs
        }
        return true
      })
      setNotes(validNotes)
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not load notes',
      )
    } finally {
      setLoadingNotes(false)
    }
  }, [showToast])

  // Sync current user details from backend (for account age and notes count)
  const fetchUserProfile = useCallback(async () => {
    if (!getStoredToken()) return
    try {
      const fresh = await apiRequest<{
        userId: string
        name: string
        email: string
        createdAt?: string
        notesCreatedCount?: number
      }>('/auth/me')
      if (fresh) {
        setUser((prev) => {
          const updated: AuthUser = {
            userId: fresh.userId,
            name: fresh.name,
            email: fresh.email,
            createdAt: fresh.createdAt || prev?.createdAt,
            notesCreatedCount: fresh.notesCreatedCount ?? prev?.notesCreatedCount ?? 0,
          }
          localStorage.setItem(USER_KEY, JSON.stringify(updated))
          return updated
        })
        if (fresh.notesCreatedCount !== undefined) {
          setTotalNotesCreated(fresh.notesCreatedCount)
        }
      }
    } catch {
      // Silently fall back to cached user info
    }
  }, [])

  useEffect(() => {
    if (user && getStoredToken()) {
      void loadNotes()
      void fetchUserProfile()
    } else {
      setNotes([])
    }
  }, [user?.userId, loadNotes, fetchUserProfile])

  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null)
      setNotes([])
      setActiveNote(null)
      setAuthError('Your session expired. Please sign in again.')
    }

    window.addEventListener('notebug-session-expired', handleSessionExpired)
    window.addEventListener('little-notes-session-expired', handleSessionExpired)

    return () => {
      window.removeEventListener('notebug-session-expired', handleSessionExpired)
      window.removeEventListener('little-notes-session-expired', handleSessionExpired)

      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('notebug-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    setAccountName(user?.name ?? '')
  }, [user?.name])

  // Categorized note lists
  const activeNotesList = useMemo(() => notes.filter((n) => !n.archived && !n.deleted), [notes])
  const archivedNotesList = useMemo(() => notes.filter((n) => n.archived && !n.deleted), [notes])
  const binNotesList = useMemo(() => notes.filter((n) => n.deleted), [notes])

  // Filtered notes according to current view and search query
  const displayedNotes = useMemo(() => {
    const query = search.trim().toLowerCase()

    let baseNotes: Note[] = []
    if (currentView === 'notes') {
      baseNotes = activeNotesList
    } else if (currentView === 'archive') {
      baseNotes = archivedNotesList
    } else if (currentView === 'bin') {
      baseNotes = binNotesList
    }

    return baseNotes
      .filter((note) => {
        if (!query) {
          return true
        }

        return (
          note.title.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query)
        )
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [activeNotesList, archivedNotesList, binNotesList, currentView, search])

  // Split active notes into Pinned and Others (Google Keep style)
  const { pinnedNotes, otherNotes } = useMemo(() => {
    if (currentView !== 'notes' || search.trim() !== '') {
      return { pinnedNotes: [], otherNotes: displayedNotes }
    }
    const pinned = displayedNotes.filter((n) => n.pinned)
    const others = displayedNotes.filter((n) => !n.pinned)
    return { pinnedNotes: pinned, otherNotes: others }
  }, [displayedNotes, currentView, search])

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setBusy(true)

    try {
      if (authMode === 'signup') {
        await apiRequest<AuthResponse>(
          '/auth/signup',
          {
            method: 'POST',
            body: JSON.stringify({
              name: authName.trim(),
              email: authEmail.trim(),
              password: authPassword,
            }),
          },
          false,
        )

        setAuthMode('login')
        setAuthPassword('')
        setAuthError('')
        showToast('Account created! Please sign in.')
      } else {
        const result = await apiRequest<AuthResponse>(
          '/auth/login',
          {
            method: 'POST',
            body: JSON.stringify({
              email: authEmail.trim(),
              password: authPassword,
            }),
          },
          false,
        )

        if (!result.token) {
          throw new Error('The server did not return an authentication token.')
        }

        const loggedInUser: AuthUser = {
          userId: String(result.userId ?? ''),
          name: result.name ?? authEmail.split('@')[0],
          email: result.email ?? authEmail.trim(),
          createdAt: result.createdAt || new Date().toISOString(),
          notesCreatedCount: result.notesCreatedCount ?? 0,
        }

        localStorage.setItem(TOKEN_KEY, result.token)
        localStorage.setItem(USER_KEY, JSON.stringify(loggedInUser))

        setUser(loggedInUser)
        setTotalNotesCreated(loggedInUser.notesCreatedCount ?? 0)
        setNotes([])
        setActiveNote(null)
        setAuthPassword('')
        showToast('Welcome to notebug!')
      }
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Something went wrong.',
      )
    } finally {
      setBusy(false)
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    localStorage.removeItem(LEGACY_USER_KEY)

    setUser(null)
    setNotes([])
    setActiveNote(null)
    setCurrentView('notes')
    setProfileOpen(false)
    setSearch('')
    setAuthError('')
    setAuthPassword('')
    showToast('You have signed out.')
  }

  async function saveAccountDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextName = accountName.trim()
    if (!nextName) {
      showToast('Please enter your name.')
      return
    }

    setSavingAccount(true)
    try {
      const result = await apiRequest<{ name: string; email: string; userId: string; createdAt?: string }>(
        '/auth/me',
        { method: 'PUT', body: JSON.stringify({ name: nextName }) },
      )
      const updatedUser: AuthUser = {
        userId: user?.userId ?? result.userId,
        name: result.name,
        email: result.email,
        createdAt: result.createdAt || user?.createdAt,
        notesCreatedCount: user?.notesCreatedCount ?? totalNotesCreated,
      }
      localStorage.setItem(USER_KEY, JSON.stringify(updatedUser))
      setUser(updatedUser)
      showToast('Account details updated.')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update account details.')
    } finally {
      setSavingAccount(false)
    }
  }

  async function submitBugReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = bugReportMessage.trim()
    if (!message) {
      showToast('Please describe the bug first.')
      return
    }

    setSendingBugReport(true)
    try {
      await apiRequest<void>('/feedback', {
        method: 'POST',
        body: JSON.stringify({ message: `[BUG REPORT] ${message}` }),
      })
      setBugReportMessage('')
      showToast('Bug report sent! Thank you for helping us fix it.')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not send bug report.')
    } finally {
      setSendingBugReport(false)
    }
  }

  function createNote() {
    setCurrentView('notes')
    const newNote: Note = {
      id: `new-${crypto.randomUUID()}`,
      title: '',
      content: '',
      richContent: textToContent(''),
      pinned: false,
      archived: false,
      deleted: false,
      deletedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isNew: true,
    }

    loadedNoteId.current = null
    setActiveNote(newNote)
  }

  async function saveNote() {
    if (!activeNote || savingNote) {
      return
    }

    const noteBeingSaved = activeNote

    if (
      !noteBeingSaved.title.trim() &&
      !noteBeingSaved.content.trim()
    ) {
      if (!noteBeingSaved.isNew) {
        try {
          await apiRequest<void>(`/notes/${noteBeingSaved.id}?permanent=true`, {
            method: 'DELETE',
          })

          setNotes((current) =>
            current.filter((note) => note.id !== noteBeingSaved.id),
          )
        } catch (error) {
          showToast(
            error instanceof Error ? error.message : 'Could not delete note',
          )
          return
        }
      }

      loadedNoteId.current = null
      setActiveNote(null)
      return
    }

    setSavingNote(true)

    try {
      const payload = {
        title: noteBeingSaved.title.trim() || 'Untitled',
        content: noteBeingSaved.richContent,
        pinned: noteBeingSaved.pinned,
        archived: noteBeingSaved.archived,
        deleted: noteBeingSaved.deleted,
        deletedAt: noteBeingSaved.deletedAt,
      }

      let saved: ApiNote
      if (noteBeingSaved.isNew) {
        saved = await apiRequest<ApiNote>('/notes', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setTotalNotesCreated((prev) => prev + 1)
      } else {
        saved = await apiRequest<ApiNote>(`/notes/${noteBeingSaved.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      }

      const mapped = mapApiNote(saved)

      setNotes((current) => {
        const withoutSaved = current.filter((note) => note.id !== mapped.id)
        return [mapped, ...withoutSaved]
      })

      loadedNoteId.current = null
      setActiveNote(null)
      showToast('Note saved')
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not save note',
      )
    } finally {
      setSavingNote(false)
    }
  }

  // Toggle Pinned state (Google Keep)
  async function togglePin(note: Note, event?: React.MouseEvent) {
    if (event) {
      event.stopPropagation()
    }
    const nextPinned = !note.pinned

    setNotes((current) =>
      current.map((n) =>
        n.id === note.id ? { ...n, pinned: nextPinned, updatedAt: Date.now() } : n,
      ),
    )

    if (activeNote?.id === note.id) {
      setActiveNote((curr) => (curr ? { ...curr, pinned: nextPinned } : null))
    }

    if (!note.isNew) {
      try {
        await apiRequest<ApiNote>(`/notes/${note.id}/pin`, { method: 'PUT' })
      } catch {
        // Fallback to general PUT
        await apiRequest<ApiNote>(`/notes/${note.id}`, {
          method: 'PUT',
          body: JSON.stringify({ pinned: nextPinned }),
        }).catch(() => null)
      }
    }

    showToast(nextPinned ? 'Pinned to top' : 'Unpinned from top')
  }

  // Toggle Archive
  async function toggleArchive(note: Note, event?: React.MouseEvent) {
    if (event) {
      event.stopPropagation()
    }
    setMenuNote(null)

    const nextArchived = !note.archived
    const nextPinned = nextArchived ? false : note.pinned

    setNotes((current) =>
      current.map((n) =>
        n.id === note.id
          ? {
              ...n,
              archived: nextArchived,
              pinned: nextPinned,
              updatedAt: Date.now(),
            }
          : n,
      ),
    )

    if (activeNote?.id === note.id) {
      loadedNoteId.current = null
      setActiveNote(null)
    }

    if (!note.isNew) {
      try {
        await apiRequest<ApiNote>(`/notes/${note.id}/archive`, { method: 'PUT' })
      } catch {
        await apiRequest<ApiNote>(`/notes/${note.id}`, {
          method: 'PUT',
          body: JSON.stringify({ archived: nextArchived, pinned: nextPinned }),
        }).catch(() => null)
      }
    }

    showToast(nextArchived ? 'Note archived' : 'Note unarchived')
  }

  // Move to Bin (Soft Delete for 15 days)
  async function moveToBin(note: Note, event?: React.MouseEvent) {
    if (event) {
      event.stopPropagation()
    }
    setMenuNote(null)

    if (note.isNew) {
      if (activeNote?.id === note.id) {
        loadedNoteId.current = null
        setActiveNote(null)
      }
      showToast('Draft discarded')
      return
    }

    const nowIso = new Date().toISOString()

    setNotes((current) =>
      current.map((item) =>
        item.id === note.id
          ? { ...item, deleted: true, deletedAt: nowIso, pinned: false }
          : item,
      ),
    )

    if (activeNote?.id === note.id) {
      loadedNoteId.current = null
      setActiveNote(null)
    }

    try {
      await apiRequest<void>(`/notes/${note.id}`, { method: 'DELETE' })
      showToast('Note moved to bin (kept for 15 days)')
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not delete note',
      )
    }
  }

  // Restore note from Bin
  async function restoreNote(note: Note, event?: React.MouseEvent) {
    if (event) {
      event.stopPropagation()
    }
    setMenuNote(null)

    setNotes((current) =>
      current.map((item) =>
        item.id === note.id
          ? { ...item, deleted: false, deletedAt: null }
          : item,
      ),
    )

    try {
      await apiRequest<ApiNote>(`/notes/${note.id}/restore`, { method: 'PUT' })
      showToast('Note restored from bin')
    } catch {
      await apiRequest<ApiNote>(`/notes/${note.id}`, {
        method: 'PUT',
        body: JSON.stringify({ deleted: false, deletedAt: null }),
      }).catch(() => null)
      showToast('Note restored')
    }
  }

  // Delete permanently from Bin
  async function deletePermanently(note: Note, event?: React.MouseEvent) {
    if (event) {
      event.stopPropagation()
    }
    setMenuNote(null)

    setNotes((current) => current.filter((item) => item.id !== note.id))

    try {
      await apiRequest<void>(`/notes/${note.id}?permanent=true`, { method: 'DELETE' })
      showToast('Note permanently deleted')
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not permanently delete note',
      )
    }
  }

  // Empty all notes in Bin
  async function handleEmptyBin() {
    setNotes((current) => current.filter((n) => !n.deleted))
    setEmptyBinDialogOpen(false)

    try {
      await apiRequest<void>('/notes/bin', { method: 'DELETE' })
      showToast('Bin emptied')
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not empty bin',
      )
    }
  }

  function exportPdf() {
    if (!activeNote || !editor) {
      showToast('Open a note first to export it.')
      return
    }

    const title = activeNote.title.trim() || 'Untitled'
    const safeTitle = title
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

    const contentHtml = editor.getHTML()

    const printWindow = window.open('', '_blank')

    if (!printWindow) {
      showToast('Allow pop-ups to export your PDF.')
      return
    }

    printWindow.document.open()
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${safeTitle}</title>

          <style>
            @page {
              size: A4;
              margin: 20mm;
            }

            body {
              font-family: Arial, sans-serif;
              color: #222;
              line-height: 1.7;
              overflow-wrap: break-word;
            }

            h1 {
              font-size: 26px;
              margin-bottom: 24px;
              padding-bottom: 12px;
              border-bottom: 1px solid #ddd;
            }

            h2, h3, h4 {
              page-break-after: avoid;
            }

            p, li, blockquote {
              orphans: 3;
              widows: 3;
            }

            pre {
              white-space: pre-wrap;
              overflow-wrap: break-word;
            }

            img {
              max-width: 100%;
              height: auto;
            }

            blockquote {
              border-left: 3px solid #ccc;
              margin-left: 0;
              padding-left: 16px;
              color: #555;
            }

            ul, ol {
              padding-left: 28px;
            }

            a {
              color: inherit;
              text-decoration: underline;
            }

            @media print {
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
          </style>
        </head>

        <body>
          <h1>${safeTitle}</h1>
          <main>${contentHtml}</main>
        </body>
      </html>
    `)
    printWindow.document.close()

    printWindow.onload = () => {
      printWindow.focus()
      printWindow.print()
    }

    window.setTimeout(() => {
      if (!printWindow.closed) {
        printWindow.focus()
        printWindow.print()
      }
    }, 500)
  }

  function extractText() {
    if (!editor || !activeNote) {
      showToast('Open a note first.')
      return
    }

    imageInputRef.current?.click()
  }

  async function handleImageSelected(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('Please choose an image smaller than 10 MB.')
      return
    }

    if (!editor || !activeNote || ocrLoading) {
      return
    }

    setOcrLoading(true)
    setOcrProgress(0)

    try {
      const worker = await createWorker('eng', 1, {
        logger: (message) => {
          if (message.status === 'recognizing text') {
            setOcrProgress(
              Math.round((message.progress ?? 0) * 100),
            )
          }
        },
      })

      let extractedText = ''

      try {
        const result = await worker.recognize(file)
        extractedText = result.data.text.trim()
      } finally {
        await worker.terminate()
      }

      if (!extractedText) {
        showToast('No readable text found in that image.')
        return
      }

      const escapedText = extractedText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

      const formattedText = `<p>${escapedText.replace(
        /\r\n|\r|\n/g,
        '<br>',
      )}</p>`

      editor.chain().focus().insertContent(formattedText).run()

      showToast('Text extracted! Review it before saving your note.')
    } catch (error) {
      console.error('OCR error:', error)
      showToast(
        'Could not read this image. Please try another image.',
      )
    } finally {
      setOcrLoading(false)
      setOcrProgress(0)
    }
  }

  function toggleFontFamily(value: string) {
    setFontFamily(value)

    if (!editor) {
      return
    }

    if (value === 'Inter') {
      editor.chain().focus().unsetFontFamily().run()
    } else {
      editor.chain().focus().setFontFamily(value).run()
    }
  }

  function toggleFontSize(value: string) {
    setFontSize(value)

    if (!editor) {
      return
    }

    editor
      .chain()
      .focus()
      .setMark('textStyle', { fontSize: value })
      .run()
  }

  // Account statistics
  const { ageString, memberSince } = useMemo(() => formatAccountAge(user?.createdAt), [user?.createdAt])
  const activeCount = activeNotesList.length
  const archivedCount = archivedNotesList.length
  const binCount = binNotesList.length

  if (!user) {
    return (
      <main className={`app-shell auth-shell ${darkMode ? 'dark-theme' : ''}`}>
        <section className="auth-card">
          <div className="auth-brand">
            <span className="brand-mark">
              <Bug size={23} />
            </span>
            <span className="brand-name">notebug</span>
          </div>

          <p className="eyebrow">
            YOUR SPACE, YOUR THOUGHTS
          </p>

          <h1>
            {authMode === 'login'
              ? 'Welcome back.'
              : 'A mindful space for you.'}
          </h1>

          <p className="auth-subtitle">
            {authMode === 'login'
              ? 'Sign in to pick up where your thoughts left off.'
              : 'Create your account and start collecting your thoughts.'}
          </p>

          <form className="auth-form" onSubmit={submitAuth}>
            {authMode === 'signup' && (
              <label>
                Your name
                <input
                  autoComplete="name"
                  value={authName}
                  onChange={(event) => setAuthName(event.target.value)}
                  placeholder="What should we call you?"
                  required
                />
              </label>
            )}

            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                autoComplete={
                  authMode === 'login' ? 'current-password' : 'new-password'
                }
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
            </label>

            {authError && (
              <p className="auth-error" role="alert">
                {authError}
              </p>
            )}

            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <>{authMode === 'login' ? 'Sign in' : 'Create account'}</>
              )}
            </button>
          </form>

          <p className="auth-switch">
            {authMode === 'login'
              ? "Don't have an account?"
              : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'signup' : 'login')
                setAuthError('')
              }}
            >
              {authMode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>

          <p className="auth-footnote">
            A calmer place to keep the things that matter.
          </p>
        </section>

        {toast && <div className="toast">{toast}</div>}
      </main>
    )
  }

  return (
    <main className={`app-shell ${darkMode ? 'dark-theme' : ''}`}>
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="icon-button sidebar-toggle"
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <PanelLeftClose size={19} /> : <Menu size={20} />}
          </button>

          <button
            className="brand-button"
            type="button"
            onClick={() => {
              loadedNoteId.current = null
              setActiveNote(null)
              setCurrentView('notes')
            }}
          >
            <span className="brand-mark">
              <Bug size={21} />
            </span>
            <span className="brand-name">notebug</span>
          </button>
        </div>

        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            inputMode="search"
            placeholder={`Search ${currentView === 'archive' ? 'archived' : currentView === 'bin' ? 'bin' : 'your'} notes...`}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)

              if (activeNote) {
                loadedNoteId.current = null
                setActiveNote(null)
              }
            }}
            aria-label="Search notes"
          />

          {search && (
            <button
              className="icon-button search-clear"
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="topbar-actions">
          {/* Help & User manual icon replaces OCR & PDF on landing page */}
          <button
            className="icon-button help-icon-btn"
            type="button"
            title="Help & User manual"
            aria-label="Help & User manual"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle size={21} />
          </button>

          {/* User profile button - opens popup box instead of logging out! */}
          <button
            className="avatar-button"
            type="button"
            title={`${user.name} (Click for profile & stats)`}
            aria-label="User profile"
            onClick={() => setProfileOpen((prev) => !prev)}
          >
            {(user.name || user.email || 'U').charAt(0).toUpperCase()}
          </button>
        </div>
      </header>

      {/* User Profile Popup Modal */}
      {profileOpen && (
        <div className="popup-backdrop" onClick={() => setProfileOpen(false)}>
          <div className="profile-popup" onClick={(e) => e.stopPropagation()}>
            <div className="profile-popup-header">
              <div className="profile-popup-avatar">
                {(user.name || user.email || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="profile-popup-info">
                <h3>{user.name}</h3>
                <p className="profile-popup-email">{user.email}</p>
              </div>
              <button
                className="icon-button profile-popup-close"
                type="button"
                onClick={() => setProfileOpen(false)}
                aria-label="Close profile"
              >
                <X size={18} />
              </button>
            </div>

            <div className="profile-popup-stats">
              <div className="stat-card">
                <div className="stat-icon">
                  <Clock size={18} />
                </div>
                <div className="stat-details">
                  <span className="stat-label">Account age</span>
                  <span className="stat-value">{ageString}</span>
                  <small className="stat-sub">Member since {memberSince}</small>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Layers size={18} />
                </div>
                <div className="stat-details">
                  <span className="stat-label">Notes created so far</span>
                  <span className="stat-value">
                    {Math.max(totalNotesCreated, notes.length)}{' '}
                    {Math.max(totalNotesCreated, notes.length) === 1 ? 'note' : 'notes'}
                  </span>
                  <small className="stat-sub">
                    {activeCount} active · {archivedCount} archived · {binCount} in bin
                  </small>
                </div>
              </div>
            </div>

            <div className="profile-popup-actions">
              <button
                className="popup-settings-btn"
                type="button"
                onClick={() => {
                  setProfileOpen(false)
                  loadedNoteId.current = null
                  setActiveNote(null)
                  setCurrentView('settings')
                }}
              >
                <Settings size={16} />
                <span>Account settings</span>
              </button>

              <button
                className="popup-logout-btn"
                type="button"
                onClick={logout}
              >
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help / User Manual Modal */}
      {helpOpen && (
        <div className="popup-backdrop" onClick={() => setHelpOpen(false)}>
          <div className="manual-popup" onClick={(e) => e.stopPropagation()}>
            <div className="manual-popup-header">
              <div className="manual-title-row">
                <span className="manual-badge">
                  <HelpCircle size={20} />
                </span>
                <div>
                  <h2>User Manual</h2>
                  <p>Everything you need to know to capture, organize, and protect your thoughts.</p>
                </div>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="Close user manual"
              >
                <X size={20} />
              </button>
            </div>

            <div className="manual-content">
              <section className="manual-section">
                <div className="manual-section-heading">
                  <StickyNote size={18} />
                  <h3>1. Taking & Formatting Notes</h3>
                </div>
                <p>
                  Click <strong>New note</strong> to begin writing. The editor features a rich toolbar:
                  use <strong>Bold</strong>, <strong>Italic</strong>, and <strong>Underline</strong> for emphasis,
                  choose from multiple typography options (Inter, Arial, Georgia, Verdana), and adjust font sizes
                  from 12px to 32px.
                </p>
              </section>

              <section className="manual-section">
                <div className="manual-section-heading">
                  <Pin size={18} />
                  <h3>2. Pinning Notes to the Top</h3>
                </div>
                <p>
                  Keep your top-priority thoughts right at your fingertips. Click the <strong>Pin icon</strong> on
                  any note card or directly in the editor header. Pinned notes are grouped together in a dedicated
                  <strong> PINNED</strong> section at the top of your board.
                </p>
              </section>

              <section className="manual-section">
                <div className="manual-section-heading">
                  <Archive size={18} />
                  <h3>3. Archiving Notes</h3>
                </div>
                <p>
                  Finished with a note but want to keep it for future reference? Click <strong>Archive note</strong> in
                  the note's menu or editor header. Archived notes are stored safely in the <strong>Archive</strong> tab
                  in the sidebar and can be restored back to your active notes anytime.
                </p>
              </section>

              <section className="manual-section">
                <div className="manual-section-heading">
                  <Trash2 size={18} />
                  <h3>4. Bin & 15-Day Auto-Retention</h3>
                </div>
                <p>
                  When you delete a note, it moves to the <strong>Bin</strong> instead of vanishing permanently.
                  Notes stay in the bin for <strong>15 days</strong> with a live countdown of remaining days.
                  You can restore any note back to your workspace or choose <strong>Delete forever</strong> to remove it immediately.
                </p>
              </section>

              <section className="manual-section">
                <div className="manual-section-heading">
                  <ImagePlus size={18} />
                  <h3>5. OCR & Extracting Text from Images</h3>
                </div>
                <p>
                  Inside any open note, click the <strong>Extract text</strong> icon in the header actions. Select any
                  photo, document scan, or screenshot, and notebug's built-in OCR engine will recognize the text and insert
                  it directly into your note!
                </p>
              </section>

              <section className="manual-section">
                <div className="manual-section-heading">
                  <FileDown size={18} />
                  <h3>6. Exporting Notes to Clean PDF</h3>
                </div>
                <p>
                  Inside any open note, click the <strong>Export PDF</strong> button to generate an elegant,
                  printable document preserving all your formatting and typography.
                </p>
              </section>

              <section className="manual-section">
                <div className="manual-section-heading">
                  <UserRound size={18} />
                  <h3>7. Profile & Account Statistics</h3>
                </div>
                <p>
                  Click your profile avatar in the top-right corner anytime to view your name, email,
                  exact account age, and the total count of notes you have created.
                </p>
              </section>

              <section className="manual-section">
                <div className="manual-section-heading">
                  <Bug size={18} />
                  <h3>8. Reporting Bugs</h3>
                </div>
                <p>
                  Spotted an error, layout issue, or bug? Navigate to <strong>Settings &gt; Found a bug? Report to us</strong>
                  to submit a bug report directly to our team.
                </p>
              </section>
            </div>

            <div className="manual-popup-footer">
              <button
                className="save-button"
                type="button"
                onClick={() => setHelpOpen(false)}
              >
                <Check size={16} /> Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal for emptying bin */}
      {emptyBinDialogOpen && (
        <div className="popup-backdrop" onClick={() => setEmptyBinDialogOpen(false)}>
          <div className="confirm-popup" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon danger">
              <Trash2 size={24} />
            </div>
            <h3>Empty the bin?</h3>
            <p>
              All {binCount} {binCount === 1 ? 'note' : 'notes'} currently in the bin will be permanently deleted.
              This action cannot be undone.
            </p>
            <div className="confirm-actions">
              <button
                className="cancel-btn"
                type="button"
                onClick={() => setEmptyBinDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                className="danger-btn"
                type="button"
                onClick={handleEmptyBin}
              >
                Empty bin permanently
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="app-layout">
        {sidebarOpen && (
          <aside className="sidebar">
            <button
              className="new-note-button"
              type="button"
              onClick={createNote}
            >
              <Plus size={19} />
              <span>New note</span>
            </button>

            <nav className="sidebar-nav">
              <button
                className={`nav-item ${!activeNote && currentView === 'notes' ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  loadedNoteId.current = null
                  setActiveNote(null)
                  setCurrentView('notes')
                }}
              >
                <StickyNote size={18} />
                <span>Notes</span>
                <span className="nav-count">{activeCount}</span>
              </button>

              <button
                className={`nav-item ${!activeNote && currentView === 'archive' ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  loadedNoteId.current = null
                  setActiveNote(null)
                  setCurrentView('archive')
                }}
              >
                <Archive size={18} />
                <span>Archive</span>
                <span className="nav-count">{archivedCount}</span>
              </button>

              <button
                className={`nav-item ${!activeNote && currentView === 'bin' ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  loadedNoteId.current = null
                  setActiveNote(null)
                  setCurrentView('bin')
                }}
              >
                <Trash2 size={18} />
                <span>Bin</span>
                <span className="nav-count">{binCount}</span>
              </button>

              <button
                className={`nav-item ${!activeNote && currentView === 'settings' ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  loadedNoteId.current = null
                  setActiveNote(null)
                  setCurrentView('settings')
                }}
              >
                <Settings size={18} />
                <span>Settings</span>
              </button>
            </nav>

            <div className="sidebar-bottom">
              <div
                className="sidebar-user"
                onClick={() => setProfileOpen(true)}
                title="Click to view profile & stats"
              >
                <div className="user-avatar">
                  {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                </div>

                <div className="user-details">
                  <span className="user-name">{user.name}</span>
                  <span className="user-email">{user.email}</span>
                </div>

                <button
                  className="icon-button"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    logout()
                  }}
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut size={17} />
                </button>
              </div>
            </div>
          </aside>
        )}

        <section className="workspace">
          {currentView === 'settings' ? (
            <div className="settings-page">
              <div className="settings-heading">
                <p className="eyebrow">MAKE IT YOURS</p>
                <h1>Settings</h1>
                <p className="notes-subtitle">A few small things to make notebug feel like your space.</p>
              </div>

              <section className="settings-card">
                <div className="settings-card-heading">
                  <span className="settings-icon"><Sun size={19} /></span>
                  <div>
                    <h2>Appearance</h2>
                    <p>Choose the look that's easiest on your eyes.</p>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <strong>Dark mode</strong>
                    <span>Use a darker earthy theme throughout the app.</span>
                  </div>
                  <button
                    className={`theme-toggle ${darkMode ? 'is-on' : ''}`}
                    type="button"
                    role="switch"
                    aria-checked={darkMode}
                    onClick={() => setDarkMode((current) => !current)}
                  >
                    <span className="theme-toggle-knob">{darkMode ? <Moon size={13} /> : <Sun size={13} />}</span>
                    <span>{darkMode ? 'On' : 'Off'}</span>
                  </button>
                </div>
              </section>

              <section className="settings-card">
                <div className="settings-card-heading">
                  <span className="settings-icon"><UserRound size={19} /></span>
                  <div>
                    <h2>Account details</h2>
                    <p>Manage the basic details connected to your account.</p>
                  </div>
                </div>
                <form className="settings-form" onSubmit={saveAccountDetails}>
                  <label>
                    Name
                    <input type="text" value={accountName} onChange={(event) => setAccountName(event.target.value)} maxLength={100} required />
                  </label>
                  <label>
                    Email address
                    <input type="email" value={user.email} readOnly />
                    <small>Your email is used to sign in and can't be changed here.</small>
                  </label>
                  <div className="settings-form-actions">
                    <button className="save-button" type="submit" disabled={savingAccount}>
                      {savingAccount ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                      {savingAccount ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </form>
              </section>

              {/* Bug report card replacing generic feedback */}
              <section className="settings-card">
                <div className="settings-card-heading">
                  <span className="settings-icon"><Bug size={19} /></span>
                  <div>
                    <h2>Found a bug? Report to us</h2>
                    <p>Encountered a glitch, error, or unexpected behavior? Let us know so we can fix it.</p>
                  </div>
                </div>
                <form className="settings-form" onSubmit={submitBugReport}>
                  <label>
                    Describe the bug
                    <textarea
                      value={bugReportMessage}
                      onChange={(event) => setBugReportMessage(event.target.value)}
                      placeholder="What happened, what did you expect, and how can we reproduce it?"
                      rows={4}
                      maxLength={2000}
                      required
                    />
                    <small>{bugReportMessage.length}/2000 characters</small>
                  </label>
                  <div className="settings-form-actions">
                    <button className="save-button" type="submit" disabled={sendingBugReport || !bugReportMessage.trim()}>
                      {sendingBugReport ? <LoaderCircle className="spin" size={16} /> : <Bug size={16} />}
                      {sendingBugReport ? 'Submitting…' : 'Report bug'}
                    </button>
                  </div>
                </form>
              </section>

              <section className="settings-card settings-signout-card">
                <div>
                  <h2>Sign out</h2>
                  <p>Finished for now? Your saved notes will be here when you return.</p>
                </div>
                <button className="secondary-button" type="button" onClick={logout}>
                  <LogOut size={16} /> Sign out
                </button>
              </section>
            </div>
          ) : activeNote ? (
            <div className="editor-panel">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                hidden
                aria-label="Choose an image for text extraction"
                onChange={(event) => void handleImageSelected(event)}
              />

              <div className="editor-header">
                <button
                  className="icon-button"
                  type="button"
                  onClick={saveNote}
                  title="Back to notes"
                  aria-label="Back to notes"
                >
                  <ArrowLeft size={19} />
                </button>

                <div className="editor-heading">
                  <span className="editor-note-id">
                    NOTE {displayNoteId(activeNote.id)}
                  </span>
                  <span className="editor-save-status">
                    {savingNote ? 'Saving…' : activeNote.pinned ? 'Pinned note' : 'Your thoughts, your space'}
                  </span>
                </div>

                <div className="editor-header-actions">
                  {/* Pin button inside note editor */}
                  <button
                    className={`icon-button ${activeNote.pinned ? 'pin-active-btn' : ''}`}
                    type="button"
                    title={activeNote.pinned ? 'Unpin note' : 'Pin note to top'}
                    aria-label="Pin note"
                    onClick={() => void togglePin(activeNote)}
                  >
                    <Pin size={18} className={activeNote.pinned ? 'pinned-svg' : ''} />
                  </button>

                  {/* Archive button inside note editor */}
                  <button
                    className={`icon-button ${activeNote.archived ? 'archive-active-btn' : ''}`}
                    type="button"
                    title={activeNote.archived ? 'Unarchive note' : 'Archive note'}
                    aria-label="Archive note"
                    onClick={() => void toggleArchive(activeNote)}
                  >
                    {activeNote.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
                  </button>

                  {/* OCR text extraction in note editor */}
                  <button
                    className="icon-button"
                    type="button"
                    title={
                      ocrLoading
                        ? `Extracting text: ${ocrProgress}%`
                        : 'Extract text from image'
                    }
                    aria-label="Extract text from image"
                    disabled={ocrLoading}
                    onClick={extractText}
                  >
                    {ocrLoading ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : (
                      <ImagePlus size={18} />
                    )}
                  </button>

                  {/* PDF export in note editor */}
                  <button
                    className="icon-button"
                    type="button"
                    title="Export PDF"
                    onClick={exportPdf}
                  >
                    <FileDown size={18} />
                  </button>

                  {/* Move note to bin */}
                  <button
                    className="icon-button danger-icon"
                    type="button"
                    title="Move to bin"
                    onClick={() => void moveToBin(activeNote)}
                  >
                    <Trash2 size={18} />
                  </button>

                  <button
                    className="save-button"
                    type="button"
                    onClick={saveNote}
                    disabled={savingNote}
                  >
                    {savingNote ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Check size={16} />
                    )}
                    <span>{savingNote ? 'Saving' : 'Save note'}</span>
                  </button>
                </div>
              </div>

              <input
                className="editor-title"
                type="text"
                placeholder="Give your note a title..."
                value={activeNote.title}
                onChange={(event) =>
                  updateActive('title', event.target.value)
                }
                aria-label="Note title"
              />

              <div className="editor-toolbar">
                <span className="editor-tool-label">
                  <Type size={17} />
                </span>

                <span className="toolbar-divider" />

                <button
                  className={`format-button ${
                    editor?.isActive('bold') ? 'is-active' : ''
                  }`}
                  type="button"
                  title="Bold"
                  aria-label="Bold"
                  aria-pressed={editor?.isActive('bold') ?? false}
                  disabled={!editor}
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                >
                  <Bold size={17} />
                </button>

                <button
                  className={`format-button ${
                    editor?.isActive('italic') ? 'is-active' : ''
                  }`}
                  type="button"
                  title="Italic"
                  aria-label="Italic"
                  aria-pressed={editor?.isActive('italic') ?? false}
                  disabled={!editor}
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                >
                  <Italic size={17} />
                </button>

                <button
                  className={`format-button ${
                    editor?.isActive('underline') ? 'is-active' : ''
                  }`}
                  type="button"
                  title="Underline"
                  aria-label="Underline"
                  aria-pressed={editor?.isActive('underline') ?? false}
                  disabled={!editor}
                  onClick={() =>
                    editor?.chain().focus().toggleUnderline().run()
                  }
                >
                  <UnderlineIcon size={17} />
                </button>

                <span className="toolbar-divider" />

                <label className="toolbar-select" title="Font family">
                  <select
                    value={fontFamily}
                    onChange={(event) => toggleFontFamily(event.target.value)}
                    aria-label="Font family"
                  >
                    <option value="Inter">Inter</option>
                    <option value="Arial">Arial</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Courier New">Courier New</option>
                  </select>
                  <ChevronDown size={14} className="select-arrow-icon" />
                </label>

                <label className="toolbar-select size-select" title="Font size">
                  <select
                    value={fontSize}
                    onChange={(event) => toggleFontSize(event.target.value)}
                    aria-label="Font size"
                  >
                    <option value="12px">12</option>
                    <option value="14px">14</option>
                    <option value="16px">16</option>
                    <option value="18px">18</option>
                    <option value="20px">20</option>
                    <option value="24px">24</option>
                    <option value="28px">28</option>
                    <option value="32px">32</option>
                  </select>
                  <ChevronDown size={14} className="select-arrow-icon" />
                </label>
              </div>

              <div className="editor-content-wrap">
                <EditorContent
                  editor={editor}
                  className="editor-content tiptap-content"
                />
              </div>

              <div className="editor-footer">
                <span>
                  {activeNote.content.length} characters
                </span>
                <span>
                  {activeNote.isNew ? 'New note' : 'Last edited'} ·{' '}
                  {formatDate(activeNote.updatedAt)}
                </span>
              </div>
            </div>
          ) : (
            <div className="notes-home">
              <div className="notes-heading">
                <div>
                  <p className="eyebrow">
                    {currentView === 'archive'
                      ? 'SAFE & ORGANIZED'
                      : currentView === 'bin'
                      ? '15-DAY RETENTION'
                      : 'A LITTLE SPACE TO THINK'}
                  </p>
                  <h1>
                    {search
                      ? 'Search results'
                      : currentView === 'archive'
                      ? 'Archive'
                      : currentView === 'bin'
                      ? 'Bin'
                      : 'Your notes'}
                  </h1>
                  <p className="notes-subtitle">
                    {search
                      ? `Notes matching “${search}”`
                      : currentView === 'archive'
                      ? 'Notes you have tucked away out of daily view.'
                      : currentView === 'bin'
                      ? 'Notes in the bin are kept for 15 days before permanent deletion.'
                      : 'Keep your thoughts close and your mind a little lighter.'}
                  </p>
                </div>

                <div className="heading-actions">
                  {currentView === 'bin' && binCount > 0 && (
                    <button
                      className="secondary-button danger-secondary"
                      type="button"
                      onClick={() => setEmptyBinDialogOpen(true)}
                    >
                      <Trash2 size={16} />
                      Empty bin
                    </button>
                  )}

                  {currentView === 'notes' && (
                    <button
                      className="new-note-button home-new-note"
                      type="button"
                      onClick={createNote}
                    >
                      <Plus size={18} />
                      New note
                    </button>
                  )}
                </div>
              </div>

              {loadingNotes ? (
                <div className="empty-state">
                  <LoaderCircle className="spin" size={27} />
                  <p>Gathering your notes…</p>
                </div>
              ) : currentView === 'notes' && !search && pinnedNotes.length > 0 ? (
                /* Google Keep layout with Pinned & Others sections */
                <div className="notes-sections-wrapper">
                  <section className="notes-section">
                    <div className="section-title">
                      <Pin size={13} className="section-pin-icon" />
                      <span>PINNED</span>
                    </div>
                    <div className="notes-grid">
                      {pinnedNotes.map((note) => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          menuNote={menuNote}
                          setMenuNote={setMenuNote}
                          setActiveNote={setActiveNote}
                          loadedNoteId={loadedNoteId}
                          togglePin={togglePin}
                          toggleArchive={toggleArchive}
                          moveToBin={moveToBin}
                          restoreNote={restoreNote}
                          deletePermanently={deletePermanently}
                          currentView={currentView}
                        />
                      ))}
                    </div>
                  </section>

                  {otherNotes.length > 0 && (
                    <section className="notes-section">
                      <div className="section-title">
                        <span>OTHERS</span>
                      </div>
                      <div className="notes-grid">
                        {otherNotes.map((note) => (
                          <NoteCard
                            key={note.id}
                            note={note}
                            menuNote={menuNote}
                            setMenuNote={setMenuNote}
                            setActiveNote={setActiveNote}
                            loadedNoteId={loadedNoteId}
                            togglePin={togglePin}
                            toggleArchive={toggleArchive}
                            moveToBin={moveToBin}
                            restoreNote={restoreNote}
                            deletePermanently={deletePermanently}
                            currentView={currentView}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              ) : displayedNotes.length > 0 ? (
                <div className="notes-grid">
                  {displayedNotes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      menuNote={menuNote}
                      setMenuNote={setMenuNote}
                      setActiveNote={setActiveNote}
                      loadedNoteId={loadedNoteId}
                      togglePin={togglePin}
                      toggleArchive={toggleArchive}
                      moveToBin={moveToBin}
                      restoreNote={restoreNote}
                      deletePermanently={deletePermanently}
                      currentView={currentView}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    {search ? (
                      <Search size={25} />
                    ) : currentView === 'archive' ? (
                      <Archive size={25} />
                    ) : currentView === 'bin' ? (
                      <Trash2 size={25} />
                    ) : (
                      <StickyNote size={25} />
                    )}
                  </div>

                  <h2>
                    {search
                      ? 'No matching notes'
                      : currentView === 'archive'
                      ? 'Archive is empty'
                      : currentView === 'bin'
                      ? 'Bin is empty'
                      : 'A fresh page.'}
                  </h2>

                  <p>
                    {search
                      ? 'Try another search term.'
                      : currentView === 'archive'
                      ? 'Notes you archive will appear here.'
                      : currentView === 'bin'
                      ? 'Notes you delete will stay here for 15 days before being purged.'
                      : 'Your next idea, reminder, or little thought can start here.'}
                  </p>

                  {!search && currentView === 'notes' && (
                    <button
                      className="new-note-button"
                      type="button"
                      onClick={createNote}
                    >
                      <Plus size={18} />
                      Create your first note
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            className="toast-close"
            type="button"
            onClick={() => setToast('')}
            aria-label="Dismiss message"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </main>
  )
}

/**
 * Reusable Note Card Component supporting Notes, Archive, and 15-day Bin
 */
function NoteCard({
  note,
  menuNote,
  setMenuNote,
  setActiveNote,
  loadedNoteId,
  togglePin,
  toggleArchive,
  moveToBin,
  restoreNote,
  deletePermanently,
  currentView,
}: {
  note: Note
  menuNote: string | null
  setMenuNote: (id: string | null) => void
  setActiveNote: (note: Note) => void
  loadedNoteId: React.MutableRefObject<string | null>
  togglePin: (note: Note, e?: React.MouseEvent) => void
  toggleArchive: (note: Note, e?: React.MouseEvent) => void
  moveToBin: (note: Note, e?: React.MouseEvent) => void
  restoreNote: (note: Note, e?: React.MouseEvent) => void
  deletePermanently: (note: Note, e?: React.MouseEvent) => void
  currentView: ViewMode
}) {
  const isBin = currentView === 'bin'
  const isArchive = currentView === 'archive'
  const daysLeft = isBin ? getBinDaysLeft(note.deletedAt) : null

  return (
    <article
      className={`note-card ${note.pinned ? 'is-pinned-card' : ''} ${isBin ? 'is-bin-card' : ''}`}
      onClick={() => {
        if (isBin) return
        loadedNoteId.current = null
        setActiveNote({ ...note })
      }}
    >
      <div className="note-card-top">
        <span className="note-card-id">
          {displayNoteId(note.id)}
        </span>

        <div className="card-top-actions">
          {/* Pin toggle button on card (only for active notes) */}
          {!isBin && !isArchive && (
            <button
              className={`icon-button card-pin-btn ${note.pinned ? 'is-pinned' : ''}`}
              type="button"
              title={note.pinned ? 'Unpin note' : 'Pin note to top'}
              aria-label="Pin note"
              onClick={(e) => togglePin(note, e)}
            >
              <Pin size={16} />
            </button>
          )}

          {/* Quick unarchive button if in Archive view */}
          {isArchive && (
            <button
              className="icon-button card-unarchive-btn"
              type="button"
              title="Unarchive note"
              aria-label="Unarchive note"
              onClick={(e) => toggleArchive(note, e)}
            >
              <ArchiveRestore size={16} />
            </button>
          )}

          {/* 3-dots Context Menu Button */}
          <button
            className="icon-button note-menu-button"
            type="button"
            title="Note options"
            aria-label={`Options for ${note.title || 'Untitled'}`}
            onClick={(event) => {
              event.stopPropagation()
              setMenuNote(menuNote === note.id ? null : note.id)
            }}
          >
            <MoreHorizontal size={19} />
          </button>

          {menuNote === note.id && (
            <div
              className="note-context-menu"
              onClick={(event) => event.stopPropagation()}
            >
              {!isBin && (
                <button
                  type="button"
                  onClick={() => {
                    loadedNoteId.current = null
                    setActiveNote({ ...note })
                    setMenuNote(null)
                  }}
                >
                  <StickyNote size={15} />
                  Open note
                </button>
              )}

              {!isBin && !isArchive && (
                <button
                  type="button"
                  onClick={(e) => {
                    togglePin(note, e)
                    setMenuNote(null)
                  }}
                >
                  <Pin size={15} />
                  {note.pinned ? 'Unpin note' : 'Pin to top'}
                </button>
              )}

              {!isBin && (
                <button
                  type="button"
                  onClick={(e) => {
                    toggleArchive(note, e)
                    setMenuNote(null)
                  }}
                >
                  {note.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  {note.archived ? 'Unarchive note' : 'Archive note'}
                </button>
              )}

              {!isBin && (
                <button
                  className="context-delete"
                  type="button"
                  onClick={(e) => {
                    moveToBin(note, e)
                    setMenuNote(null)
                  }}
                >
                  <Trash2 size={15} />
                  Move to bin
                </button>
              )}

              {isBin && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      restoreNote(note, e)
                      setMenuNote(null)
                    }}
                  >
                    <RotateCcw size={15} />
                    Restore note
                  </button>
                  <button
                    className="context-delete"
                    type="button"
                    onClick={(e) => {
                      deletePermanently(note, e)
                      setMenuNote(null)
                    }}
                  >
                    <Trash2 size={15} />
                    Delete forever
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <h2>{note.title || 'Untitled'}</h2>

      <p className="note-card-content">
        {note.content || 'An empty page, ready for your thoughts.'}
      </p>

      {/* Days left in bin badge */}
      {isBin && daysLeft !== null && (
        <div className="bin-retention-pill">
          <Clock size={12} />
          <span>
            {daysLeft === 0
              ? '< 1 day remaining'
              : daysLeft === 1
              ? '1 day remaining'
              : `${daysLeft} days remaining`}
          </span>
        </div>
      )}

      <div className="note-card-footer">
        <span>{formatDate(note.updatedAt)}</span>

        {isBin ? (
          <div className="bin-card-quick-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="bin-restore-btn"
              type="button"
              title="Restore note"
              onClick={(e) => restoreNote(note, e)}
            >
              <RotateCcw size={14} /> Restore
            </button>
            <button
              className="bin-delete-btn"
              type="button"
              title="Delete permanently"
              onClick={(e) => deletePermanently(note, e)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : (
          <span className="note-card-open">Open note ↗</span>
        )}
      </div>
    </article>
  )
}

export default App
