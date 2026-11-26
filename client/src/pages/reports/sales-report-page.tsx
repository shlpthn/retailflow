import React, { useEffect, useState } from 'react'
import { api, type ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { cn, fmtMoney } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type GroupBy = 'day' | 'week' | 'month'

interface ReportBucket {
  period: string
  receiptCount: number
  grossRevenue: number
  totalDiscount: number
  netRevenue: number
}

interface SalesReport {
  from: string
  to: string
  groupBy: GroupBy
  receiptCount: number
  grossRevenue: number
  totalDiscount: number
  netRevenue: number
  averageReceiptValue: number
  buckets: ReportBucket[]
}

const GROUP_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

// The server compares dates in UTC, so the default range is built in UTC too.
const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10)
const DAY_MS = 86400000

// The project's Tailwind theme does not define the semantic color utilities
// (bg-card, bg-primary, ...), so these point at the variables in index.css.
const CARD = 'bg-[var(--paper-raised)] ring-[var(--line)]'
const FIELD = 'w-40 border-[var(--line)] bg-white'
const toggleClass = (selected: boolean) =>
  cn(
    'border-[var(--line)] bg-white',
    selected &&
      'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]'
  )
const ROW = 'border-[var(--line-soft)]'

export const SalesReportPage: React.FC = () => {
  const { user, stores } = useAuth()
  const isHeadOffice = user?.role === 'HEAD_OFFICE_MANAGER'

  // Default: the last 7 days including today (US-10.1).
  const [from, setFrom] = useState(() => isoDay(Date.now() - 6 * DAY_MS))
  const [to, setTo] = useState(() => isoDay(Date.now()))
  const [groupBy, setGroupBy] = useState<GroupBy>('day')
  const [storeId, setStoreId] = useState('') // '' = all stores (Head Office only)

  const [report, setReport] = useState<SalesReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const rangeError = !from || !to
    ? 'Choose both a start date and an end date.'
    : from > to
      ? 'The start date must not be after the end date.'
      : null

  useEffect(() => {
    if (rangeError) return
    let cancelled = false // ignore answers to filters that have since changed

    const params = new URLSearchParams({ from, to, groupBy })
    // A Store Manager is limited to their own store by the server.
    if (isHeadOffice && storeId) params.set('storeId', storeId)

    setLoading(true)
    setError(null)
    api<SalesReport>(`/reports/sales?${params.toString()}`)
      .then((data) => {
        if (!cancelled) setReport(data)
      })
      .catch((err: ApiError) => {
        if (cancelled) return
        setReport(null)
        setError(
          err.status === 404 && err.message === 'Not found'
            ? 'This server does not provide the sales report yet.'
            : err.message || 'Failed to load the sales report'
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [from, to, groupBy, storeId, isHeadOffice, rangeError])

  const message = rangeError || error
  const visible = !message && !loading ? report : null

  const metrics = visible
    ? [
        { label: 'Receipts', value: String(visible.receiptCount) },
        { label: 'Gross revenue', value: fmtMoney(visible.grossRevenue) },
        { label: 'Total discount', value: fmtMoney(visible.totalDiscount) },
        { label: 'Net revenue', value: fmtMoney(visible.netRevenue) },
        { label: 'Average receipt', value: fmtMoney(visible.averageReceiptValue) },
      ]
    : []

  return (
    <div className="flex flex-col gap-4">
      <Card className={CARD}>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-from">From</Label>
            <Input
              id="report-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className={FIELD}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-to">To</Label>
            <Input
              id="report-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className={FIELD}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium leading-none">Group by</span>
            <div className="flex gap-1">
              {GROUP_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant="outline"
                  className={toggleClass(groupBy === option.value)}
                  aria-pressed={groupBy === option.value}
                  onClick={() => setGroupBy(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          {isHeadOffice && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium leading-none">Store</span>
              <div className="flex flex-wrap gap-1">
                {[{ id: '', name: 'All stores' }, ...stores].map((store) => (
                  <Button
                    key={store.id || 'all'}
                    variant="outline"
                    className={toggleClass(storeId === store.id)}
                    aria-pressed={storeId === store.id}
                    onClick={() => setStoreId(store.id)}
                  >
                    {store.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {message && (
        <Card className={CARD}>
          <CardContent className="py-6 text-center text-[var(--bad)]">{message}</CardContent>
        </Card>
      )}

      {!message && loading && (
        <Card className={CARD}>
          <CardContent className="muted py-6 text-center">Loading report…</CardContent>
        </Card>
      )}

      {visible && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {metrics.map((metric) => (
              <Card key={metric.label} size="sm" className={CARD}>
                <CardContent>
                  <div className="font-mono text-xl font-bold">{metric.value}</div>
                  <div className="muted text-xs">{metric.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className={CARD}>
            <CardHeader>
              <CardTitle>
                {visible.from} to {visible.to}, by {visible.groupBy}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {visible.buckets.length === 0 ? (
                <div className="muted py-6 text-center">No sales in this period.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className={ROW}>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Receipts</TableHead>
                      <TableHead className="text-right">Gross revenue</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Net revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.buckets.map((bucket) => (
                      <TableRow key={bucket.period} className={ROW}>
                        <TableCell className="font-mono">{bucket.period}</TableCell>
                        <TableCell className="text-right font-mono">{bucket.receiptCount}</TableCell>
                        <TableCell className="text-right font-mono">{fmtMoney(bucket.grossRevenue)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtMoney(bucket.totalDiscount)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtMoney(bucket.netRevenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
