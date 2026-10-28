import React, { useState } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, Copy, Check, Loader2 } from 'lucide-react';

interface CsvImportModalProps {
  onClose: () => void;
  onImportSuccess: (importedCount: number) => void;
}

const SAMPLE_CSV = `Business Name,Category,City,State,Phone,Website,Email,Notes
Sydney Emergency Plumbing,Plumbing,Sydney,NSW,02 9876 5432,https://sydneyplumbing.com.au,service@sydneyplumbing.com.au,24/7 emergency dispatch target
Melbourne Dental Suite,Dental Practice,Melbourne,VIC,03 9123 4567,https://melbournedentalsuite.com.au,hello@melbournedentalsuite.com.au,Busy cosmetic clinic
Brisbane Hair & Co,Hair Salon,Brisbane,QLD,07 3222 1111,https://brisbanehair.com.au,bookings@brisbanehair.com.au,High appointment volume`;

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  onClose,
  onImportSuccess,
}) => {
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [loading, setLoading] = useState(false);
  const [copiedSample, setCopiedSample] = useState(false);
  const [result, setResult] = useState<{
    totalRows: number;
    importedCount: number;
    duplicateCount: number;
    errorCount: number;
    errors: { rowNumber: number; reason: string }[];
  } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setCsvText(content);
        setResult(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvText.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/csv/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText }),
      });
      const data = await res.json();
      setResult(data);
      if (data.importedCount > 0) {
        onImportSuccess(data.importedCount);
      }
    } catch (err) {
      console.error('Import error:', err);
    } finally {
      setLoading(false);
    }
  };

  const copySample = () => {
    navigator.clipboard.writeText(SAMPLE_CSV);
    setCopiedSample(true);
    setTimeout(() => setCopiedSample(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#252525]/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-[#E7E7E2] rounded-2xl max-w-2xl w-full flex flex-col shadow-xl overflow-hidden my-auto animate-fadeIn text-[#252525]">
        {/* Header */}
        <div className="p-5 border-b border-[#E7E7E2] bg-[#F7F7F4] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#252525] flex items-center gap-2">
              <Upload className="w-4.5 h-4.5 text-[#78B9E8]" />
              Import Australian Business List (CSV)
            </h2>
            <p className="text-xs text-[#777777] mt-0.5">
              Import prospect lists with address normalization, deduplication, and automated scoring.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#777777] hover:text-[#252525] hover:bg-[#EFEFEA] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {/* File input & sample helper */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-[#FAF9F5] border border-[#E7E7E2]">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-white hover:bg-[#F7F7F4] text-[#252525] font-medium border border-[#E7E7E2] transition-colors shadow-2xs">
                <span>Choose .CSV File</span>
                <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
              </label>
              <span className="text-[#777777]">or paste CSV text directly below</span>
            </div>

            <button
              onClick={copySample}
              className="flex items-center gap-1.5 text-[#2B6CB0] hover:underline text-[11px]"
            >
              {copiedSample ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSample ? 'Sample Copied!' : 'Copy Template Format'}</span>
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#555555] uppercase tracking-wider mb-1">
              CSV Content
            </label>
            <textarea
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setResult(null);
              }}
              rows={8}
              placeholder="Paste comma-separated rows with header: Business Name, Category, City, State..."
              className="w-full px-3 py-2 rounded-xl bg-[#FAF9F5] border border-[#E7E7E2] text-[#252525] font-mono text-xs focus:ring-1 focus:ring-[#78B9E8] focus:bg-white focus:outline-none"
            />
          </div>

          {/* Validation & Import Results Feedback */}
          {result && (
            <div className="p-4 rounded-xl bg-[#F7F7F4] border border-[#E7E7E2] space-y-2">
              <div className="font-semibold text-[#252525] flex items-center justify-between">
                <span>Validation & Import Summary</span>
                <span className="text-[#777777] text-[11px]">Total rows processed: {result.totalRows}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-lg bg-[#EAF7EE] border border-[#C6ECD2] text-[#1D7A41]">
                  <div className="font-bold text-base">{result.importedCount}</div>
                  <div className="text-[10px]">Imported to CRM</div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#EBF5FB] border border-[#CDE5F7] text-[#2B6CB0]">
                  <div className="font-bold text-base">{result.duplicateCount}</div>
                  <div className="text-[10px]">Duplicates Skipped</div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#FDE8E8] border border-[#F8B4B4] text-[#9B1C1C]">
                  <div className="font-bold text-base">{result.errorCount}</div>
                  <div className="text-[10px]">Malformed Rows</div>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="pt-2 text-[#9B1C1C] text-[11px] space-y-1">
                  <span className="font-semibold block">Row Errors:</span>
                  {result.errors.map((err, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                      <span>Row {err.rowNumber}: {err.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E7E7E2] bg-[#F7F7F4] flex items-center justify-between">
          <div className="text-[11px] text-[#777777]">
            Records marked as <strong className="text-[#333333]">User CSV Import</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-[#EFEFEA] text-[#555555] border border-[#E7E7E2] transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleImport}
              disabled={loading || !csvText.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-[#78B9E8] hover:bg-[#68A9D8] text-white transition-colors disabled:opacity-40 shadow-2xs"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              <span>Execute CSV Import</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
