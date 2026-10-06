import React, { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { PageIcon } from '@/lib/page-icons'

interface ModelSummary {
  modelVersion: string
  algorithm?: { name?: string; k?: number; topN?: number }
  dataset?: { source?: string; fileName?: string; sha256?: string; sourceRowCount?: number; usableRowCount?: number; filteredRowCount?: number }
  split?: { strategy?: string; trainRows?: number; validationRows?: number; testRows?: number }
  stats?: Record<string, number>
  metrics?: Record<string, unknown>
  trainedAt?: string
  deployedAt?: string | null
}

interface MlStatus {
  deployed: ModelSummary | null
  candidate: ModelSummary | null
  hasDeployedModel: boolean
}

const modelLabel = (model: ModelSummary | null) => model ? `${model.algorithm?.name || 'KNN'} · k=${model.algorithm?.k || '—'} · top-N=${model.algorithm?.topN || '—'}` : 'No model artifact'

export const MlConsolePage: React.FC = () => {
  const [status, setStatus] = useState<MlStatus | null>(null)
  const [fileName, setFileName] = useState('data/uci/Online Retail.xlsx')
  const [mappingText, setMappingText] = useState('{}')
  const [k, setK] = useState('20')
  const [topN, setTopN] = useState('5')
  const [busy, setBusy] = useState(false)

  const loadStatus = async () => {
    try {
      setStatus(await api<MlStatus>('/ml/status'))
    } catch (err: any) {
      toast.error(err.message || 'Unable to load ML status')
    }
  }

  useEffect(() => { loadStatus() }, [])

  const train = async () => {
    let catalogMapping: Record<string, string>
    try {
      catalogMapping = JSON.parse(mappingText)
    } catch {
      toast.error('Catalog mapping must be valid JSON')
      return
    }
    setBusy(true)
    try {
      await api('/ml/train', {
        method: 'POST',
        body: { fileName, k: Number(k), topN: Number(topN), catalogMapping },
      })
      toast.success('Candidate model trained')
      await loadStatus()
    } catch (err: any) {
      toast.error(err.message || 'Training failed')
    } finally {
      setBusy(false)
    }
  }

  const deploy = async () => {
    setBusy(true)
    try {
      await api('/ml/deploy', { method: 'POST' })
      toast.success('Candidate model deployed')
      await loadStatus()
    } catch (err: any) {
      toast.error(err.message || 'Deployment failed')
    } finally {
      setBusy(false)
    }
  }

  const rows = (model: ModelSummary | null) => model ? [
    ['Source rows', model.dataset?.sourceRowCount ?? '—'],
    ['Usable rows', model.dataset?.usableRowCount ?? '—'],
    ['Filtered rows', model.dataset?.filteredRowCount ?? '—'],
    ['Train / validation / test', `${model.split?.trainRows ?? '—'} / ${model.split?.validationRows ?? '—'} / ${model.split?.testRows ?? '—'}`],
    ['Split strategy', model.split?.strategy || '—'],
  ] : []

  return (
    <div className="stack">
      <div className="custom-card shadow-sm">
        <div className="section-head flex items-center gap-2 border-b border-line mb-4">
          <PageIcon name="ml" className="w-5 h-5" />
          <div>
            <h3 className="font-bold">KNN recommendation console</h3>
            <p className="text-xs text-muted-foreground">Data Scientist workspace · candidate models are deployed explicitly</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="field"><label className="text-xs font-semibold">Dataset path</label><Input value={fileName} onChange={(e) => setFileName(e.target.value)} className="mt-1" /></div>
          <div className="field"><label className="text-xs font-semibold">K neighbours</label><Input type="number" min="1" max="100" value={k} onChange={(e) => setK(e.target.value)} className="mt-1" /></div>
          <div className="field"><label className="text-xs font-semibold">Top-N</label><Input type="number" min="1" max="50" value={topN} onChange={(e) => setTopN(e.target.value)} className="mt-1" /></div>
        </div>
        <div className="field mt-3"><label className="text-xs font-semibold">External StockCode → RetailFlow product ID mapping (JSON)</label><textarea value={mappingText} onChange={(e) => setMappingText(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-line bg-white p-2 font-mono text-xs" /></div>
        <div className="flex gap-2 mt-3"><Button disabled={busy} onClick={train} className="bg-[#E2542A] text-white">{busy ? 'Working…' : 'Train candidate'}</Button><Button disabled={busy || !status?.candidate} variant="outline" onClick={deploy}>Deploy candidate</Button></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[['Candidate', status?.candidate], ['Deployed', status?.deployed]].map(([label, model]) => (
          <div className="custom-card shadow-sm" key={label as string}>
            <h3 className="font-bold mb-1">{label as string}</h3>
            <p className="text-xs text-muted-foreground mb-3">{modelLabel(model as ModelSummary | null)}</p>
            <div className="space-y-2 text-xs">{rows(model as ModelSummary | null).map(([name, value]) => <div className="flex justify-between gap-3 border-b border-line pb-1" key={name as string}><span className="text-muted-foreground">{name}</span><span className="text-right font-medium">{String(value)}</span></div>)}</div>
            {!model && <p className="empty py-5">No artifact available.</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
