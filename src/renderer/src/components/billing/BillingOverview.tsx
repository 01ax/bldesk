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
    if (invoice.invoice_view_url || invoice.download_url) {
      window.bldeskApi?.openExternal?.(invoice.invoice_view_url || invoice.download_url)
    } else {
      window.bldeskApi?.openExternal?.(`https://home.binarylane.com.au/mpanel/invoices/${invoice.invoice_number || invoice.invoice_id}`)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto select-text bg-[#f8f9fa] dark:bg-[#212529] text-[#212529] dark:text-[#f8f9fa]">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[#212529] dark:text-white flex items-center gap-2.5">
          <Receipt className="w-5 h-5 text-[#017cb6]" />
          <span>Usage, Billing & Invoices</span>
        </h1>
        <p className="text-xs text-[#6c757d] dark:text-slate-400 mt-0.5">
          Real-time account balance, pooled bandwidth, and tax invoice history.
        </p>
      </div>

      {/* Top 3 Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Account Balance Card */}
        <div className="bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg p-4 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#6c757d] dark:text-slate-400">
            <span>Available Credit</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-[#212529] dark:text-white font-mono">
            ${(balance?.available_credit || 0).toFixed(2)} AUD
          </div>
          <div className="text-[11px] text-[#6c757d]">Current balance available on account</div>
        </div>

        {/* Unbilled Charges Forecast */}
        <div className="bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg p-4 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#6c757d] dark:text-slate-400">
            <span>Unbilled Charges</span>
            <ArrowUpRight className="w-4 h-4 text-[#017cb6]" />
          </div>
          <div className="text-2xl font-bold text-[#212529] dark:text-white font-mono">
            ${(balance?.unbilled_total || 0).toFixed(2)} AUD
          </div>
          <div className="text-[11px] text-[#6c757d]">Current billing cycle accrued usage</div>
        </div>

        {/* Pooled Bandwidth Transfer */}
        <div className="bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg p-4 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#6c757d] dark:text-slate-400">
            <span>Pooled Bandwidth</span>
            <Database className="w-4 h-4 text-[#017cb6]" />
          </div>
          <div className="text-2xl font-bold text-[#212529] dark:text-white font-mono">
            {totalUsedGb.toFixed(1)} / {totalAllocatedGb > 0 ? `${totalAllocatedGb} GB` : 'Unlimited'}
          </div>
          <div className="w-full bg-[#ced4da] dark:bg-[#343a40] h-1.5 rounded-full overflow-hidden mt-1">
            <div
              className="bg-[#017cb6] h-full"
              style={{
                width: `${totalAllocatedGb > 0 ? Math.min(100, (totalUsedGb / totalAllocatedGb) * 100) : 5}%`
              }}
            />
          </div>
        </div>
      </div>

      {/* Tax Invoices Table */}
      <div className="bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg shadow-sm overflow-hidden flex flex-col">
        <div className="p-3 bg-[#f1f1f1] dark:bg-[#262a2e] border-b border-[#ced4da] dark:border-[#373b3e] flex items-center justify-between">
          <h3 className="font-semibold text-xs text-[#495057] dark:text-[#ced4da]">
            Billing History & Tax Invoices
          </h3>
          <span className="text-[11px] text-[#6c757d]">Auto-generated PDF receipts</span>
        </div>

        {invoicesQuery.isLoading && (
          <div className="p-8 text-center text-xs text-[#6c757d]">Loading invoices...</div>
        )}

        {!invoicesQuery.isLoading && invoices.length === 0 && (
          <div className="p-8 text-center text-xs text-[#6c757d]">No past invoices found.</div>
        )}

        {!invoicesQuery.isLoading && invoices.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f8f9fa] dark:bg-[#212529] border-b border-[#ced4da] dark:border-[#373b3e] text-[#6c757d]">
                  <th className="py-2.5 px-4">Invoice #</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Amount</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ced4da]/60 dark:divide-[#373b3e]">
                {invoices.map((inv: any) => {
                  const isPaid = inv.paid ?? true
                  return (
                    <tr key={inv.invoice_id} className="hover:bg-[#f8f9fa] dark:hover:bg-[#32383e] transition">
                      <td className="py-3 px-4 font-mono font-bold text-[#017cb6]">
                        {inv.invoice_number || `#${inv.invoice_id}`}
                      </td>
                      <td className="py-3 px-4 text-[#6c757d] dark:text-slate-300">
                        {inv.created ? new Date(inv.created).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-[#212529] dark:text-white">
                        ${(inv.amount || 0).toFixed(2)} AUD
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                            isPaid
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {isPaid ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          <span>{isPaid ? 'Paid' : 'Unpaid'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDownloadInvoice(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#017cb6] hover:bg-[#017cb6]/10 rounded transition"
                          title="Open Tax Invoice in Browser"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>View</span>
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
