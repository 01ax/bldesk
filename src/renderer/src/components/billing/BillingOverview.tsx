import React from 'react'
import { Receipt, DollarSign, ArrowUpRight, Download, CheckCircle, AlertTriangle, Database } from 'lucide-react'
import { BinaryLaneClient } from '../../api/client'
import { useBalance, useInvoices, useDataUsage } from '../../api/queries'

interface BillingOverviewProps {
  client: BinaryLaneClient | null
}

export const BillingOverview: React.FC<BillingOverviewProps> = ({ client }) => {
  const balanceQuery = useBalance(client)
  const invoicesQuery = useInvoices(client)
  const dataUsageQuery = useDataUsage(client)

  const balance = balanceQuery.data
  const invoices = invoicesQuery.data || []
  const dataUsages = dataUsageQuery.data || []

  // Total pooled transfer calculation
  const totalAllocatedGb = dataUsages.reduce((acc, u) => acc + (u.transfer_gigabytes || 0), 0)
  const totalUsedGb = dataUsages.reduce((acc, u) => acc + (u.current_transfer_usage_gigabytes || 0), 0)

  const handleDownloadInvoice = (invoice: any) => {
    if (invoice.download_url) {
      window.bldeskApi.openExternal(invoice.download_url)
    } else {
      window.bldeskApi.openExternal(`https://home.binarylane.com.au/mpanel/invoices/${invoice.invoice_number || invoice.id}`)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto select-text">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
          <Receipt className="w-5 h-5 text-sky-400" />
          <span>Usage, Billing & Invoices</span>
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Real-time account balance, pooled bandwidth, and tax invoice history</p>
      </div>

      {/* Top 3 Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Account Balance Card */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Available Credit</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            ${(balance?.available_credit || 0).toFixed(2)} AUD
          </div>
          <div className="text-[11px] text-slate-500">
            Current balance available on account
          </div>
        </div>

        {/* Unbilled Charges Forecast */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Unbilled Usage</span>
            <ArrowUpRight className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            ${((balance as any)?.unbilled_total || (balance as any)?.debit || 0).toFixed(2)} AUD
          </div>
          <div className="text-[11px] text-slate-500">
            Month-to-date accumulated compute charges
          </div>
        </div>

        {/* Pooled Bandwidth Transfer Card */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Pooled Bandwidth</span>
            <Database className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {totalUsedGb.toFixed(1)} <span className="text-sm font-normal text-slate-400">/ {totalAllocatedGb || 1000} GB</span>
          </div>
          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
            <div
              className="bg-purple-500 h-full rounded-full"
              style={{ width: `${Math.min(100, (totalUsedGb / (totalAllocatedGb || 1)) * 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Invoices List */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 flex-1">
        <h2 className="text-sm font-bold text-white">Tax Invoices History</h2>

        {invoices.length === 0 ? (
          <div className="text-xs text-slate-500 p-8 text-center bg-slate-950/40 rounded-xl">
            No past invoices on record for this account.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 font-semibold uppercase text-[10px]">
                  <th className="py-2.5 px-3">Invoice #</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">PDF Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {invoices.map((inv: any) => {
                  const isPaid = inv.paid ?? true
                  return (
                    <tr key={inv.id || inv.invoice_number} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-3 font-mono font-medium text-white">
                        #{inv.invoice_number || inv.id}
                      </td>
                      <td className="py-3 px-3 text-slate-400 font-mono">
                        {inv.date ? new Date(inv.date).toLocaleDateString() : 'Recent'}
                      </td>
                      <td className="py-3 px-3 font-mono text-white font-semibold">
                        ${Number(inv.amount || inv.total || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            isPaid
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                              : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                          }`}
                        >
                          {isPaid ? <CheckCircle className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
                          {isPaid ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleDownloadInvoice(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition"
                        >
                          <Download className="w-3 h-3" />
                          <span>PDF</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
