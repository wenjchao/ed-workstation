import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'

type Patient = {
  id: string
  mrn: string | null
  name: string
  sex: string | null
  dob: string | null
}

type Encounter = {
  id: string
  patient_id: string
  arrival_at: string | null
  location: string | null
  status: string
}

type Note = {
  id: string
  encounter_id: string
  note_type: string
  title: string | null
  content: string
  occurred_at: string
}

type Order = {
  id: string
  encounter_id: string
  code: string | null
  name: string
  status: string
  occurred_at: string
}

type ResultRow = {
  id: string
  encounter_id: string
  category: string
  code: string | null
  name: string
  value: string | null
  unit: string | null
  flag: string | null
  occurred_at: string
}

type DdxEntry = {
  id: string
  encounter_id: string
  source: 'human' | 'ai'
  name: string
  prob: number | null
  reason: string | null
  occurred_at: string
}

type AiRun = {
  id: string
  encounter_id: string
  provider: string
  model: string
  status: string
  created_at: string
}

type AiSuggestionRow = {
  id: string
  encounter_id: string
  ai_run_id: string
  suggestion_type: 'diagnosis' | 'order'
  code: string | null
  name: string
  prob: number | null
  reason: string | null
  created_at: string
}

type AiFunctionResult = {
  diagnoses: { name: string; prob?: number; reason?: string }[]
  recommendations: { code?: string; name: string; reason?: string }[]
}

function fmtDateTime(ts?: string | null) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtTime(ts?: string | null) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function App() {
  // ----------------------------
  // Selection (multi-patient)
  // ----------------------------
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)

  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null)

  const selectedPatient = useMemo(
    () => patients.find(p => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  )
  const selectedEncounter = useMemo(
    () => encounters.find(e => e.id === selectedEncounterId) ?? null,
    [encounters, selectedEncounterId]
  )

  // ----------------------------
  // Core clinical data (all from DB)
  // ----------------------------
  const [notes, setNotes] = useState<Note[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [results, setResults] = useState<ResultRow[]>([])
  const [ddx, setDdx] = useState<DdxEntry[]>([])

  // ----------------------------
  // UI state
  // ----------------------------
  const [isBusy, setIsBusy] = useState(false)

  // Patient create modal
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false)
  const [newPatientName, setNewPatientName] = useState('')
  const [newPatientMrn, setNewPatientMrn] = useState('')
  const [newPatientSex, setNewPatientSex] = useState('')

  // Encounter create
  const [newEncounterLocation, setNewEncounterLocation] = useState('ER-012')
  const [newEncounterArrivalAt, setNewEncounterArrivalAt] = useState('')

  // Notes edit modal
  const [editingNote, setEditingNote] = useState<{
    id?: string
    note_type: string
    title: string
    content: string
    occurred_at: string
  } | null>(null)

  // Order input
  const [orderInput, setOrderInput] = useState('')

  // Result input
  const [resultCategory, setResultCategory] = useState('lab')
  const [resultName, setResultName] = useState('')
  const [resultValue, setResultValue] = useState('')
  const [resultUnit, setResultUnit] = useState('')
  const [resultFlag, setResultFlag] = useState('')

  // Human DDX input
  const [ddxName, setDdxName] = useState('')
  const [ddxProb, setDdxProb] = useState('')
  const [ddxReason, setDdxReason] = useState('')

  // AI
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [latestAiRun, setLatestAiRun] = useState<AiRun | null>(null)
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestionRow[]>([])
  const [selectedAiOrderSuggestionIds, setSelectedAiOrderSuggestionIds] = useState<string[]>([])

  // ----------------------------
  // Helpers: timeline logging
  // ----------------------------
  const logEvent = async (args: {
    encounter_id: string
    actor_type: 'human' | 'ai' | 'system'
    event_type: string
    entity_table?: string
    entity_id?: string
    summary?: string
    payload?: unknown
    occurred_at?: string
  }) => {
    // best-effort logging; don't block UX if event logging fails
    try {
      await supabase.from('patient_events').insert([
        {
          encounter_id: args.encounter_id,
          actor_type: args.actor_type,
          event_type: args.event_type,
          entity_table: args.entity_table ?? null,
          entity_id: args.entity_id ?? null,
          summary: args.summary ?? null,
          payload: (args.payload ?? {}) as any,
          occurred_at: args.occurred_at ?? new Date().toISOString(),
        },
      ])
    } catch {
      // ignore
    }
  }

  // ----------------------------
  // Fetch: patients + encounters
  // ----------------------------
  const fetchPatients = async () => {
    const { data, error } = await supabase
      .from('patients')
      .select('id,mrn,name,sex,dob')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('fetchPatients failed:', error)
      return
    }
    setPatients((data ?? []) as Patient[])
  }

  const fetchEncounters = async (patientId: string) => {
    const { data, error } = await supabase
      .from('encounters')
      .select('id,patient_id,arrival_at,location,status')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('fetchEncounters failed:', error)
      return
    }
    setEncounters((data ?? []) as Encounter[])
  }

  // ----------------------------
  // Fetch: encounter-scoped data
  // ----------------------------
  const fetchEncounterData = async (encounterId: string) => {
    setIsBusy(true)
    try {
      const [notesRes, ordersRes, resultsRes, ddxRes] = await Promise.all([
        supabase.from('notes').select('*').eq('encounter_id', encounterId).order('occurred_at', { ascending: false }),
        supabase.from('orders').select('*').eq('encounter_id', encounterId).order('occurred_at', { ascending: false }),
        supabase.from('results').select('*').eq('encounter_id', encounterId).order('occurred_at', { ascending: false }),
        supabase.from('ddx_entries').select('*').eq('encounter_id', encounterId).order('occurred_at', { ascending: false }),
      ])

      if (notesRes.error) console.error('fetch notes failed:', notesRes.error)
      if (ordersRes.error) console.error('fetch orders failed:', ordersRes.error)
      if (resultsRes.error) console.error('fetch results failed:', resultsRes.error)
      if (ddxRes.error) console.error('fetch ddx failed:', ddxRes.error)

      setNotes((notesRes.data ?? []) as Note[])
      setOrders((ordersRes.data ?? []) as Order[])
      setResults((resultsRes.data ?? []) as ResultRow[])
      setDdx((ddxRes.data ?? []) as DdxEntry[])
    } finally {
      setIsBusy(false)
    }
  }

  const fetchLatestAi = async (encounterId: string) => {
    const { data: runData, error: runErr } = await supabase
      .from('ai_runs')
      .select('id,encounter_id,provider,model,status,created_at')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (runErr) {
      console.error('fetchLatestAi run failed:', runErr)
      setLatestAiRun(null)
      setAiSuggestions([])
      return
    }

    const run = (runData?.[0] ?? null) as AiRun | null
    setLatestAiRun(run)

    if (!run) {
      setAiSuggestions([])
      return
    }

    const { data: sugData, error: sugErr } = await supabase
      .from('ai_suggestions')
      .select('*')
      .eq('ai_run_id', run.id)
      .order('created_at', { ascending: true })

    if (sugErr) {
      console.error('fetchLatestAi suggestions failed:', sugErr)
      setAiSuggestions([])
      return
    }

    setAiSuggestions((sugData ?? []) as AiSuggestionRow[])
  }

  // ----------------------------
  // Initial load
  // ----------------------------
  useEffect(() => {
    fetchPatients()
  }, [])

  // when patient changes, load encounters
  useEffect(() => {
    if (!selectedPatientId) {
      setEncounters([])
      setSelectedEncounterId(null)
      return
    }
    fetchEncounters(selectedPatientId)
  }, [selectedPatientId])

  // when encounter changes, load encounter data
  useEffect(() => {
    if (!selectedEncounterId) {
      setNotes([])
      setOrders([])
      setResults([])
      setDdx([])
      setLatestAiRun(null)
      setAiSuggestions([])
      setSelectedAiOrderSuggestionIds([])
      return
    }
    fetchEncounterData(selectedEncounterId)
    fetchLatestAi(selectedEncounterId)
  }, [selectedEncounterId])

  // ----------------------------
  // Mutations: patients / encounters
  // ----------------------------
  const createPatient = async () => {
    const name = newPatientName.trim()
    if (!name) return

    const mrn = newPatientMrn.trim() || null
    const sex = newPatientSex.trim() || null

    const { data, error } = await supabase
      .from('patients')
      .insert([{ name, mrn, sex }])
      .select('id,mrn,name,sex,dob')
      .single()

    if (error) {
      console.error('createPatient failed:', error)
      alert('新增患者失敗: ' + error.message)
      return
    }

    setIsPatientModalOpen(false)
    setNewPatientName('')
    setNewPatientMrn('')
    setNewPatientSex('')

    await fetchPatients()
    setSelectedPatientId((data as Patient).id)
  }

  const createEncounter = async () => {
    if (!selectedPatientId) return

    const arrival_at = newEncounterArrivalAt.trim()
      ? new Date(newEncounterArrivalAt).toISOString()
      : new Date().toISOString()

    const location = newEncounterLocation.trim() || null

    const { data, error } = await supabase
      .from('encounters')
      .insert([{ patient_id: selectedPatientId, arrival_at, location, status: 'active' }])
      .select('id,patient_id,arrival_at,location,status')
      .single()

    if (error) {
      console.error('createEncounter failed:', error)
      alert('新增就診失敗: ' + error.message)
      return
    }

    await fetchEncounters(selectedPatientId)
    setSelectedEncounterId((data as Encounter).id)
  }

  // ----------------------------
  // Mutations: notes / orders / results / ddx
  // ----------------------------
  const saveNote = async () => {
    if (!selectedEncounterId || !editingNote) return

    const payload = {
      encounter_id: selectedEncounterId,
      note_type: editingNote.note_type,
      title: editingNote.title.trim() || null,
      content: editingNote.content ?? '',
      occurred_at: editingNote.occurred_at ? new Date(editingNote.occurred_at).toISOString() : new Date().toISOString(),
    }

    if (editingNote.id) {
      const { error } = await supabase.from('notes').update(payload).eq('id', editingNote.id)
      if (error) {
        console.error('update note failed:', error)
        alert('更新病歷失敗: ' + error.message)
        return
      }
      await logEvent({
        encounter_id: selectedEncounterId,
        actor_type: 'human',
        event_type: 'note_updated',
        entity_table: 'notes',
        entity_id: editingNote.id,
        summary: 'Note updated',
      })
    } else {
      const { data, error } = await supabase.from('notes').insert([payload]).select('*').single()
      if (error) {
        console.error('insert note failed:', error)
        alert('新增病歷失敗: ' + error.message)
        return
      }
      await logEvent({
        encounter_id: selectedEncounterId,
        actor_type: 'human',
        event_type: 'note_created',
        entity_table: 'notes',
        entity_id: (data as Note).id,
        summary: 'Note created',
      })
    }

    setEditingNote(null)
    await fetchEncounterData(selectedEncounterId)
  }

  const addOrder = async (rawInput: string) => {
    if (!selectedEncounterId) return
    const val = rawInput.trim()
    if (!val) return

    const [codeRaw, ...nameParts] = val.split(' ')
    const code = codeRaw ? codeRaw.toUpperCase() : null
    const name = nameParts.join(' ') || 'General Order'

    const occurred_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('orders')
      .insert([{ encounter_id: selectedEncounterId, code, name, status: 'sent', occurred_at }])
      .select('*')
      .single()

    if (error) {
      console.error('insert order failed:', error)
      alert('新增醫囑失敗: ' + error.message)
      return
    }

    await logEvent({
      encounter_id: selectedEncounterId,
      actor_type: 'human',
      event_type: 'order_created',
      entity_table: 'orders',
      entity_id: (data as Order).id,
      summary: `Order: ${code ?? ''} ${name}`,
    })

    setOrderInput('')
    await fetchEncounterData(selectedEncounterId)
  }

  const addResult = async () => {
    if (!selectedEncounterId) return
    const name = resultName.trim()
    if (!name) return

    const occurred_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('results')
      .insert([
        {
          encounter_id: selectedEncounterId,
          category: resultCategory,
          name,
          value: resultValue.trim() || null,
          unit: resultUnit.trim() || null,
          flag: resultFlag.trim() || null,
          occurred_at,
        },
      ])
      .select('*')
      .single()

    if (error) {
      console.error('insert result failed:', error)
      alert('新增報告失敗: ' + error.message)
      return
    }

    await logEvent({
      encounter_id: selectedEncounterId,
      actor_type: 'human',
      event_type: 'result_created',
      entity_table: 'results',
      entity_id: (data as ResultRow).id,
      summary: `Result: ${name}`,
    })

    setResultName('')
    setResultValue('')
    setResultUnit('')
    setResultFlag('')
    await fetchEncounterData(selectedEncounterId)
  }

  const addHumanDdx = async () => {
    if (!selectedEncounterId) return
    const name = ddxName.trim()
    if (!name) return

    const prob = ddxProb.trim() ? Number(ddxProb) : null
    const reason = ddxReason.trim() || null
    const occurred_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('ddx_entries')
      .insert([
        {
          encounter_id: selectedEncounterId,
          source: 'human',
          name,
          prob: Number.isFinite(prob as any) ? prob : null,
          reason,
          occurred_at,
        },
      ])
      .select('*')
      .single()

    if (error) {
      console.error('insert ddx failed:', error)
      alert('新增鑑別診斷失敗: ' + error.message)
      return
    }

    await logEvent({
      encounter_id: selectedEncounterId,
      actor_type: 'human',
      event_type: 'ddx_added',
      entity_table: 'ddx_entries',
      entity_id: (data as DdxEntry).id,
      summary: `DDX (human): ${name}`,
    })

    setDdxName('')
    setDdxProb('')
    setDdxReason('')
    await fetchEncounterData(selectedEncounterId)
  }

  // ----------------------------
  // AI: call function -> persist to DB -> reload
  // ----------------------------
  const runAi = async () => {
    if (!selectedEncounterId || isAiLoading) return
    setIsAiLoading(true)
    setSelectedAiOrderSuggestionIds([])

    try {
      // Build context from DB data already in state
      const context = {
        encounter_id: selectedEncounterId,
        notes: notes.map(n => ({
          note_type: n.note_type,
          title: n.title,
          content: n.content,
          occurred_at: n.occurred_at,
        })),
        orders: orders.map(o => ({ code: o.code, name: o.name, status: o.status, occurred_at: o.occurred_at })),
        results: results.map(r => ({
          category: r.category,
          name: r.name,
          value: r.value,
          unit: r.unit,
          flag: r.flag,
          occurred_at: r.occurred_at,
        })),
        ddx: ddx.map(d => ({ source: d.source, name: d.name, prob: d.prob, reason: d.reason })),
      }

      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: context,
      })

      if (error) {
        console.error('ai function error:', error)
        alert('AI 分析失敗: ' + error.message)
        return
      }

      const result = data as AiFunctionResult

      // Persist AI run
      const provider = 'gemini'
      const model = 'gemini-2.0-flash'

      const { data: runRow, error: runErr } = await supabase
        .from('ai_runs')
        .insert([
          {
            encounter_id: selectedEncounterId,
            provider,
            model,
            status: 'completed',
            prompt: context,
            response: result,
          },
        ])
        .select('id,encounter_id,provider,model,status,created_at')
        .single()

      if (runErr) {
        console.error('insert ai_runs failed:', runErr)
        alert('AI 結果儲存失敗(ai_runs): ' + runErr.message)
        return
      }

      const aiRunId = (runRow as AiRun).id

      await logEvent({
        encounter_id: selectedEncounterId,
        actor_type: 'ai',
        event_type: 'ai_run_completed',
        entity_table: 'ai_runs',
        entity_id: aiRunId,
        summary: 'AI run completed',
        payload: { provider, model },
      })

      // Persist suggestions + AI DDX
      const diagRows = (result.diagnoses ?? []).map(d => ({
        encounter_id: selectedEncounterId,
        ai_run_id: aiRunId,
        suggestion_type: 'diagnosis' as const,
        code: null,
        name: d.name,
        prob: d.prob ?? null,
        reason: d.reason ?? null,
        raw: d,
      }))

      const orderRows = (result.recommendations ?? []).map(r => ({
        encounter_id: selectedEncounterId,
        ai_run_id: aiRunId,
        suggestion_type: 'order' as const,
        code: r.code ?? null,
        name: r.name,
        prob: null,
        reason: r.reason ?? null,
        raw: r,
      }))

      const { error: sugErr } = await supabase.from('ai_suggestions').insert([...diagRows, ...orderRows])
      if (sugErr) {
        console.error('insert ai_suggestions failed:', sugErr)
        alert('AI 結果儲存失敗(ai_suggestions): ' + sugErr.message)
        return
      }

      const ddxRows = (result.diagnoses ?? []).map(d => ({
        encounter_id: selectedEncounterId,
        source: 'ai' as const,
        name: d.name,
        prob: d.prob ?? null,
        reason: d.reason ?? null,
        occurred_at: new Date().toISOString(),
        data: { ai_run_id: aiRunId },
      }))

      const { error: ddxErr } = await supabase.from('ddx_entries').insert(ddxRows)
      if (ddxErr) {
        console.error('insert ddx_entries(ai) failed:', ddxErr)
        // don't hard-fail: suggestions are still saved
      }

      // Reload latest AI + encounter data
      await fetchEncounterData(selectedEncounterId)
      await fetchLatestAi(selectedEncounterId)
    } catch (e) {
      console.error(e)
      alert('AI 連線失敗')
    } finally {
      setIsAiLoading(false)
    }
  }

  const applyAiOrders = async () => {
    if (!selectedEncounterId) return
    const picks = aiSuggestions.filter(
      s => s.suggestion_type === 'order' && selectedAiOrderSuggestionIds.includes(s.id)
    )
    if (picks.length === 0) return

    const occurred_at = new Date().toISOString()
    const rows = picks.map(p => ({
      encounter_id: selectedEncounterId,
      code: p.code,
      name: p.name,
      status: 'sent',
      occurred_at,
      data: { from_ai_run_id: p.ai_run_id, suggestion_id: p.id, reason: p.reason },
    }))

    const { data, error } = await supabase.from('orders').insert(rows).select('id')
    if (error) {
      console.error('applyAiOrders insert failed:', error)
      alert('套用 AI 醫囑失敗: ' + error.message)
      return
    }

    // Log events best-effort
    for (const inserted of data ?? []) {
      await logEvent({
        encounter_id: selectedEncounterId,
        actor_type: 'ai',
        event_type: 'order_created_from_ai',
        entity_table: 'orders',
        entity_id: (inserted as any).id,
        summary: 'Order created from AI suggestion',
      })
    }

    setSelectedAiOrderSuggestionIds([])
    await fetchEncounterData(selectedEncounterId)
  }

  // ----------------------------
  // Render
  // ----------------------------
  const isReady = !!selectedEncounterId

  const aiDiag = aiSuggestions.filter(s => s.suggestion_type === 'diagnosis')
  const aiOrder = aiSuggestions.filter(s => s.suggestion_type === 'order')

  return (
    <div className="h-screen w-screen bg-slate-900 text-slate-100 flex overflow-hidden font-sans">
      {/* Sidebar: Patients + Encounters */}
      <aside className="w-80 border-r border-slate-800 bg-slate-950/50 p-3 flex flex-col gap-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-slate-200">Patients</div>
          <button
            onClick={() => setIsPatientModalOpen(true)}
            className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded"
          >
            + Patient
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {patients.length === 0 && (
            <div className="text-xs text-slate-500 italic p-2">
              No patients yet. Click “+ Patient”.
            </div>
          )}
          {patients.map(p => (
            <button
              key={p.id}
              onClick={() => {
                setSelectedPatientId(p.id)
                setSelectedEncounterId(null)
              }}
              className={`w-full text-left p-2 rounded border transition-colors ${
                selectedPatientId === p.id
                  ? 'border-blue-500 bg-blue-900/20'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/20'
              }`}
            >
              <div className="text-sm font-bold">{p.name}</div>
              <div className="text-[11px] text-slate-500 font-mono">
                MRN: {p.mrn ?? '-'} {p.sex ? `• ${p.sex}` : ''}
              </div>
            </button>
          ))}
        </div>

        <div className="border-t border-slate-800 pt-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-200">Encounters</div>
            <button
              disabled={!selectedPatientId}
              onClick={createEncounter}
              className="text-xs bg-green-700 hover:bg-green-600 px-3 py-1 rounded disabled:opacity-40"
            >
              + Encounter
            </button>
          </div>

          <div className="mt-2 space-y-2">
            {!selectedPatientId && (
              <div className="text-xs text-slate-500 italic p-2">Select a patient first.</div>
            )}

            {selectedPatientId && encounters.length === 0 && (
              <div className="text-xs text-slate-500 italic p-2">
                No encounters. Click “+ Encounter”.
              </div>
            )}

            {selectedPatientId && (
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  value={newEncounterLocation}
                  onChange={e => setNewEncounterLocation(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                  placeholder="Location (ER-012)"
                />
                <input
                  value={newEncounterArrivalAt}
                  onChange={e => setNewEncounterArrivalAt(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                  placeholder="Arrival (optional)"
                />
              </div>
            )}

            {encounters.map(e => (
              <button
                key={e.id}
                onClick={() => setSelectedEncounterId(e.id)}
                className={`w-full text-left p-2 rounded border transition-colors ${
                  selectedEncounterId === e.id
                    ? 'border-green-500 bg-green-900/20'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-900/20'
                }`}
              >
                <div className="text-xs text-slate-300 font-bold">
                  {e.location ?? '(no location)'} • {e.status}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {e.arrival_at ? fmtDateTime(e.arrival_at) : 'arrival: -'}
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col p-3 gap-3 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-slate-800 border border-slate-700 rounded flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Patient</div>
              <div className="font-bold text-blue-100">{selectedPatient?.name ?? '-'}</div>
            </div>
            <div className="h-8 w-px bg-slate-700" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase">MRN</div>
              <div className="font-mono font-bold">{selectedPatient?.mrn ?? '-'}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Encounter</div>
              <div className="font-bold text-green-200">{selectedEncounter?.location ?? '-'}</div>
            </div>
            {isBusy && <div className="text-xs text-slate-400 italic">Loading…</div>}
          </div>
          <div className="text-right text-slate-400 text-xs">
            Arrival: {selectedEncounter?.arrival_at ? fmtDateTime(selectedEncounter.arrival_at) : '-'}
          </div>
        </header>

        {!isReady && (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm italic">
            Select a patient and encounter to begin.
          </div>
        )}

        {isReady && (
          <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3 overflow-hidden">
            {/* Notes */}
            <section className="bg-slate-800 rounded border border-slate-700 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-slate-700 flex justify-between items-center">
                <h2 className="text-blue-400 font-bold flex items-center gap-2">
                  <span>📄</span> Notes
                </h2>
                <button
                  onClick={() =>
                    setEditingNote({
                      note_type: 'Progress Note',
                      title: '',
                      content: '',
                      occurred_at: new Date().toISOString(),
                    })
                  }
                  className="bg-blue-600 hover:bg-blue-500 text-xs px-3 py-1 rounded"
                >
                  + Add
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {notes.length === 0 && (
                  <div className="text-xs text-slate-500 italic p-2">No notes.</div>
                )}
                {notes.map(n => (
                  <div
                    key={n.id}
                    onClick={() =>
                      setEditingNote({
                        id: n.id,
                        note_type: n.note_type,
                        title: n.title ?? '',
                        content: n.content ?? '',
                        occurred_at: n.occurred_at,
                      })
                    }
                    className="p-3 bg-slate-900/30 border border-slate-700 rounded hover:border-blue-500 cursor-pointer transition-colors"
                  >
                    <div className="flex justify-between text-[10px] text-blue-300 font-bold uppercase mb-1">
                      <span>{fmtTime(n.occurred_at)}</span>
                      <span>{n.note_type}</span>
                    </div>
                    <div className="font-bold text-sm text-slate-200">{n.title || '(No title)'}</div>
                    <div className="text-xs text-slate-500 mt-1 font-mono truncate">{n.content}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Orders */}
            <section className="bg-slate-800 rounded border border-slate-700 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-slate-700">
                <h2 className="text-green-400 font-bold flex items-center gap-2">
                  <span>💊</span> Orders
                </h2>
              </div>

              <div className="p-2 border-b border-slate-700 bg-slate-900/30">
                <div className="flex gap-1">
                  <input
                    value={orderInput}
                    onChange={e => setOrderInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addOrder(orderInput)}
                    type="text"
                    placeholder="CODE + Name (ex: IV001 N/S 500ml)"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm focus:border-green-500 outline-none"
                  />
                  <button
                    onClick={() => addOrder(orderInput)}
                    className="bg-green-700 hover:bg-green-600 px-3 rounded text-sm"
                  >
                    Send
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 sticky top-0 text-slate-500 uppercase">
                    <tr>
                      <th className="p-2">Status</th>
                      <th className="p-2">Content</th>
                      <th className="p-2">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {orders.map(o => (
                      <tr key={o.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="p-2">
                          <span className="px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-200 border border-blue-500/20">
                            {o.status}
                          </span>
                        </td>
                        <td className="p-2">
                          <div className="font-bold text-slate-200 uppercase">{o.code ?? '-'}</div>
                          <div className="text-slate-500">{o.name}</div>
                        </td>
                        <td className="p-2 text-slate-500 font-mono">{fmtTime(o.occurred_at)}</td>
                      </tr>
                    ))}
                    {orders.length === 0 && (
                      <tr>
                        <td className="p-3 text-slate-500 italic" colSpan={3}>
                          No orders.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Results */}
            <section className="bg-slate-800 rounded border border-slate-700 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-slate-700">
                <h2 className="text-yellow-400 font-bold flex items-center gap-2">
                  <span>🧪</span> Results
                </h2>
              </div>

              <div className="p-2 border-b border-slate-700 bg-slate-900/30 grid grid-cols-2 gap-2">
                <select
                  value={resultCategory}
                  onChange={e => setResultCategory(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                >
                  <option value="lab">lab</option>
                  <option value="imaging">imaging</option>
                  <option value="vitals">vitals</option>
                  <option value="ekg">ekg</option>
                </select>
                <input
                  value={resultName}
                  onChange={e => setResultName(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                  placeholder="Name (Troponin-I)"
                />
                <input
                  value={resultValue}
                  onChange={e => setResultValue(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                  placeholder="Value (0.450)"
                />
                <input
                  value={resultUnit}
                  onChange={e => setResultUnit(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                  placeholder="Unit (ng/mL)"
                />
                <input
                  value={resultFlag}
                  onChange={e => setResultFlag(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs col-span-2"
                  placeholder="Flag (high/low/abnormal)"
                />
                <button
                  onClick={addResult}
                  className="col-span-2 bg-yellow-700 hover:bg-yellow-600 px-3 py-1.5 rounded text-xs font-bold"
                >
                  Add Result
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {results.length === 0 && (
                  <div className="text-xs text-slate-500 italic p-2">No results.</div>
                )}
                {results.map(r => (
                  <div
                    key={r.id}
                    className="p-3 bg-slate-900/30 border border-slate-700 rounded flex justify-between items-center"
                  >
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">
                        {r.category} • {fmtTime(r.occurred_at)}
                      </div>
                      <div className="font-bold text-sm">{r.name}</div>
                      <div className="text-xs text-slate-400 font-mono">
                        {r.value ?? '-'} {r.unit ?? ''}{' '}
                        {r.flag ? <span className="text-red-300">({r.flag})</span> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* AI + DDX */}
            <section className="bg-slate-800 rounded border border-slate-700 flex flex-col overflow-hidden relative">
              <div className="p-3 border-b border-slate-700 flex justify-between items-center">
                <div>
                  <h2 className="text-purple-400 font-bold flex items-center gap-2">
                    <span>🧠</span> AI + DDX
                  </h2>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Latest AI: {latestAiRun ? `${latestAiRun.provider}/${latestAiRun.model} @ ${fmtDateTime(latestAiRun.created_at)}` : '—'}
                  </div>
                </div>
                <button
                  disabled={isAiLoading}
                  onClick={runAi}
                  className={`bg-purple-600 hover:bg-purple-500 px-3 py-1 rounded text-xs font-bold ${
                    isAiLoading ? 'opacity-50' : ''
                  }`}
                >
                  {isAiLoading ? 'Analyzing…' : '✦ Run AI'}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {/* Human DDX input */}
                <div className="p-3 border border-slate-700 rounded bg-slate-900/30">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Human-entered DDX
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={ddxName}
                      onChange={e => setDdxName(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs col-span-2"
                      placeholder="Diagnosis name"
                    />
                    <input
                      value={ddxProb}
                      onChange={e => setDdxProb(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                      placeholder="Prob (0-100, optional)"
                    />
                    <input
                      value={ddxReason}
                      onChange={e => setDdxReason(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                      placeholder="Reason (optional)"
                    />
                    <button
                      onClick={addHumanDdx}
                      className="col-span-2 bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-xs font-bold"
                    >
                      Add Human DDX
                    </button>
                  </div>
                </div>

                {/* DDX list */}
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Differential Diagnosis (Saved)
                  </div>
                  {ddx.length === 0 && (
                    <div className="text-xs text-slate-500 italic">No DDX yet.</div>
                  )}
                  {ddx.map(d => (
                    <div key={d.id} className="p-2 border border-slate-700 rounded bg-slate-900/30">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold">{d.name}</span>
                        <span className={`text-[10px] uppercase ${d.source === 'ai' ? 'text-purple-300' : 'text-slate-400'}`}>
                          {d.source} {d.prob != null ? `• ${d.prob}%` : ''}
                        </span>
                      </div>
                      {d.reason && <div className="text-[11px] text-slate-500 mt-1">{d.reason}</div>}
                    </div>
                  ))}
                </div>

                {/* AI Diagnoses */}
                <div className="pt-2 border-t border-slate-700">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                    AI Diagnoses (Saved)
                  </div>
                  {aiDiag.length === 0 && <div className="text-xs text-slate-500 italic">No AI diagnoses.</div>}
                  {aiDiag.map(s => (
                    <div key={s.id} className="mb-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span>{s.name}</span>
                        <span className="font-bold text-purple-300">{s.prob ?? 0}%</span>
                      </div>
                      <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-purple-500 h-full" style={{ width: `${Math.max(0, Math.min(100, Number(s.prob ?? 0)))}%` }} />
                      </div>
                      {s.reason && <p className="text-[10px] text-slate-500 mt-1 italic">{s.reason}</p>}
                    </div>
                  ))}
                </div>

                {/* AI Orders */}
                <div className="pt-3 border-t border-slate-700">
                  <div className="text-[10px] font-bold text-purple-300 uppercase tracking-widest mb-2">
                    AI Recommended Orders (Saved)
                  </div>
                  {aiOrder.length === 0 && <div className="text-xs text-slate-500 italic">No AI orders.</div>}

                  <div className="space-y-2">
                    {aiOrder.map(s => (
                      <label
                        key={s.id}
                        className="flex items-start gap-3 p-2 bg-slate-900/30 rounded border border-purple-900/30 cursor-pointer hover:bg-purple-900/10 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAiOrderSuggestionIds.includes(s.id)}
                          onChange={e => {
                            if (e.target.checked) setSelectedAiOrderSuggestionIds([...selectedAiOrderSuggestionIds, s.id])
                            else setSelectedAiOrderSuggestionIds(selectedAiOrderSuggestionIds.filter(x => x !== s.id))
                          }}
                          className="mt-1 accent-purple-500"
                        />
                        <div className="text-xs">
                          <div className="font-bold text-slate-200">
                            {(s.code ?? '—')} - {s.name}
                          </div>
                          {s.reason && <div className="text-[10px] text-slate-500">{s.reason}</div>}
                        </div>
                      </label>
                    ))}
                  </div>

                  <button
                    onClick={applyAiOrders}
                    disabled={selectedAiOrderSuggestionIds.length === 0}
                    className="w-full mt-3 bg-purple-900/40 hover:bg-purple-800 text-purple-100 py-2 rounded text-xs font-bold border border-purple-500/20 disabled:opacity-30"
                  >
                    Apply selected AI orders ({selectedAiOrderSuggestionIds.length})
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Patient modal */}
        {isPatientModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 border border-slate-700 w-full max-w-lg rounded-xl shadow-2xl">
              <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                <div className="font-bold text-slate-200">Create Patient</div>
                <button onClick={() => setIsPatientModalOpen(false)} className="text-slate-400 hover:text-white">
                  ✕
                </button>
              </div>
              <div className="p-4 space-y-3">
                <input
                  value={newPatientName}
                  onChange={e => setNewPatientName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"
                  placeholder="Name"
                />
                <input
                  value={newPatientMrn}
                  onChange={e => setNewPatientMrn(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"
                  placeholder="MRN (optional)"
                />
                <input
                  value={newPatientSex}
                  onChange={e => setNewPatientSex(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"
                  placeholder="Sex (optional)"
                />
              </div>
              <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
                <button
                  onClick={() => setIsPatientModalOpen(false)}
                  className="px-4 py-2 border border-slate-600 rounded text-sm hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={createPatient}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-bold"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Note modal */}
        {editingNote && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 border border-slate-700 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
              <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                <div className="font-bold text-blue-200">{editingNote.id ? 'Edit Note' : 'New Note'}</div>
                <button onClick={() => setEditingNote(null)} className="text-slate-400 hover:text-white">
                  ✕
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase mb-1">Type</div>
                    <select
                      value={editingNote.note_type}
                      onChange={e => setEditingNote({ ...editingNote, note_type: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm"
                    >
                      <option>Admission Note</option>
                      <option>Progress Note</option>
                      <option>Consult Note</option>
                      <option>ER Summary</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase mb-1">Occurred At</div>
                    <input
                      value={editingNote.occurred_at ? new Date(editingNote.occurred_at).toISOString().slice(0, 16) : ''}
                      onChange={e => {
                        const iso = e.target.value ? new Date(e.target.value).toISOString() : new Date().toISOString()
                        setEditingNote({ ...editingNote, occurred_at: iso })
                      }}
                      type="datetime-local"
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-500 uppercase mb-1">Title</div>
                  <input
                    value={editingNote.title}
                    onChange={e => setEditingNote({ ...editingNote, title: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm"
                    placeholder="Title (optional)"
                  />
                </div>

                <div>
                  <div className="text-[10px] text-slate-500 uppercase mb-1">Content</div>
                  <textarea
                    value={editingNote.content}
                    onChange={e => setEditingNote({ ...editingNote, content: e.target.value })}
                    rows={12}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm font-mono"
                    placeholder="Write clinical note..."
                  />
                </div>
              </div>

              <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
                <button
                  onClick={() => setEditingNote(null)}
                  className="px-4 py-2 border border-slate-600 rounded text-sm hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNote}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-bold"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
