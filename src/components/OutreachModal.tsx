import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  Copy, 
  Check, 
  Mail, 
  PhoneCall, 
  FileText, 
  Repeat, 
  ShieldAlert, 
  CheckCircle2, 
  ExternalLink,
  Loader2,
  Sliders,
  Sparkles,
  Save,
  RotateCcw
} from 'lucide-react';
import { BusinessRecord, OutreachDraft } from '../types.js';

interface OutreachModalProps {
  business: BusinessRecord;
  onClose: () => void;
  onOutreachSent: (businessId: string) => void;
}

export const OutreachModal: React.FC<OutreachModalProps> = ({
  business,
  onClose,
  onOutreachSent,
}) => {
  const [channel, setChannel] = useState<'email' | 'call_script' | 'contact_form' | 'follow_up'>('email');
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  // In-place editable draft fields
  const [customSubject, setCustomSubject] = useState('');
  const [customContent, setCustomContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  // Customizer parameters (ZeroLeaks Engineered Revenue Infrastructure style)
  const [showParameters, setShowParameters] = useState(false);
  const [dealSize, setDealSize] = useState('5,000 dollar');
  const [demoUrl, setDemoUrl] = useState('https://zeroleaks.it/');
  const [brandSignoff, setBrandSignoff] = useState('ZeroLeaks | Engineered Revenue Infrastructure');

  const fetchOrGenerateDraft = async (
    targetChannel: 'email' | 'call_script' | 'contact_form' | 'follow_up',
    overrideOptions?: { dealSize?: string; demoUrl?: string; brandSignoff?: string }
  ) => {
    setGenerating(true);
    setSendResult(null);
    setSaveMessage(null);
    setIsDirty(false);

    try {
      const res = await fetch('/api/outreach/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          channel: targetChannel,
          options: {
            dealSize: overrideOptions?.dealSize || dealSize,
            demoUrl: overrideOptions?.demoUrl || demoUrl,
            brandSignoff: overrideOptions?.brandSignoff || brandSignoff,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDraft(data);
        setCustomSubject(data.subject || '');
        setCustomContent(data.content || '');
        setIsApproved(data.isApproved || false);
      }
    } catch (err) {
      console.error('Failed to generate draft:', err);
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrGenerateDraft(channel);
  }, [channel, business.id]);

  const handleSaveDraftChanges = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch(`/api/outreach/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: customSubject,
          content: customContent,
          isApproved,
          channel,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setDraft(updated);
        setIsDirty(false);
        setSaveMessage('Custom changes saved to lead file');
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage('Failed to save changes');
      }
    } catch (err: any) {
      setSaveMessage('Error saving: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApproveToggle = async () => {
    if (!draft) return;
    const nextApproved = !isApproved;
    setIsApproved(nextApproved);
    try {
      await fetch(`/api/outreach/approve/${draft.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: nextApproved }),
      });
    } catch (err) {
      console.error('Approval sync failed:', err);
    }
  };

  const handleSend = async () => {
    if (!draft || !isApproved) return;

    // Automatically save pending edits before recording dispatch
    if (isDirty) {
      await handleSaveDraftChanges();
    }

    setSending(true);
    setSendResult(null);

    try {
      const res = await fetch(`/api/outreach/send/${draft.id}`, {
        method: 'POST',
      });
      const data = await res.json();
      setSendResult(data);
      if (data.success) {
        onOutreachSent(business.id);
      }
    } catch (err: any) {
      setSendResult({ success: false, message: err.message || 'Dispatch failed' });
    } finally {
      setSending(false);
    }
  };

  const handleCopy = () => {
    const fullText = customSubject
      ? `Subject: ${customSubject}\n\n${customContent}`
      : customContent;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mailtoUrl = customSubject && business.email
    ? `mailto:${encodeURIComponent(business.email)}?subject=${encodeURIComponent(customSubject)}&body=${encodeURIComponent(customContent)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-[#252525]/45 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-[#E7E7E2] rounded-2xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-fadeIn text-[#252525]">
        {/* Header */}
        <div className="p-5 border-b border-[#E7E7E2] bg-[#F7F7F4] flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#2B6CB0] text-white uppercase tracking-wider">
                Engineered Revenue Infrastructure
              </span>
              <span className="text-xs text-[#777777]">
                Target: <strong className="text-[#252525]">{business.name}</strong> ({business.city || 'Australia'}, {business.state})
              </span>
            </div>
            <h2 className="text-base font-semibold text-[#252525] tracking-tight flex items-center gap-2">
              <span>Personalized High-Ticket Sales Outreach</span>
              <span className="text-xs font-normal text-[#666666] hidden sm:inline">
                (ZeroLeaks Missed-Call & Automation Formula)
              </span>
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowParameters(!showParameters)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                showParameters
                  ? 'bg-[#EBF5FB] border-[#CDE5F7] text-[#2B6CB0]'
                  : 'bg-white border-[#E7E7E2] text-[#555555] hover:text-[#252525]'
              }`}
              title="Customize Deal Size, Demo URL, and Brand Signoff"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{showParameters ? 'Hide Controls' : 'Pitch Settings'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#777777] hover:text-[#252525] hover:bg-[#EFEFEA] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Pitch Parameter Customization Drawer */}
        {showParameters && (
          <div className="p-4 bg-[#FAF9F5] border-b border-[#E7E7E2] grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fadeIn">
            <div>
              <label className="block text-[11px] font-semibold text-[#555555] uppercase tracking-wider mb-1">
                High-Ticket Opportunity Value
              </label>
              <input
                type="text"
                value={dealSize}
                onChange={(e) => setDealSize(e.target.value)}
                placeholder="e.g. 5,000 dollar or $5,000"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D5D5D0] rounded-md focus:border-[#78B9E8] focus:outline-hidden"
              />
              <p className="text-[10px] text-[#777777] mt-0.5">Used in "never misses a $X opportunity"</p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#555555] uppercase tracking-wider mb-1">
                Demonstration Asset URL
              </label>
              <input
                type="text"
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                placeholder="https://zeroleaks.it/"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D5D5D0] rounded-md focus:border-[#78B9E8] focus:outline-hidden"
              />
              <p className="text-[10px] text-[#777777] mt-0.5">Live case study or interactive demo</p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#555555] uppercase tracking-wider mb-1">
                Brand & Diagnostic Signoff
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={brandSignoff}
                  onChange={(e) => setBrandSignoff(e.target.value)}
                  placeholder="ZeroLeaks | Engineered Revenue Infrastructure"
                  className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-[#D5D5D0] rounded-md focus:border-[#78B9E8] focus:outline-hidden"
                />
                <button
                  onClick={() => fetchOrGenerateDraft(channel, { dealSize, demoUrl, brandSignoff })}
                  disabled={generating}
                  className="px-2.5 py-1.5 rounded-md bg-[#78B9E8] hover:bg-[#68A9D8] text-white text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                  title="Re-synthesize copy with these parameters"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Apply</span>
                </button>
              </div>
              <p className="text-[10px] text-[#777777] mt-0.5">Appended to 15-min Diagnostic invite</p>
            </div>
          </div>
        )}

        {/* Channel Switcher */}
        <div className="p-3 bg-[#F7F7F4] border-b border-[#E7E7E2] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setChannel('email')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                channel === 'email'
                  ? 'bg-[#78B9E8] text-white shadow-2xs'
                  : 'bg-white text-[#555555] hover:text-[#252525] hover:bg-[#EFEFEA] border border-[#E7E7E2]'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email Pitch</span>
            </button>

            <button
              onClick={() => setChannel('call_script')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                channel === 'call_script'
                  ? 'bg-[#78B9E8] text-white shadow-2xs'
                  : 'bg-white text-[#555555] hover:text-[#252525] hover:bg-[#EFEFEA] border border-[#E7E7E2]'
              }`}
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Cold Call Script</span>
            </button>

            <button
              onClick={() => setChannel('contact_form')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                channel === 'contact_form'
                  ? 'bg-[#78B9E8] text-white shadow-2xs'
                  : 'bg-white text-[#555555] hover:text-[#252525] hover:bg-[#EFEFEA] border border-[#E7E7E2]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Website Contact Form</span>
            </button>

            <button
              onClick={() => setChannel('follow_up')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                channel === 'follow_up'
                  ? 'bg-[#78B9E8] text-white shadow-2xs'
                  : 'bg-white text-[#555555] hover:text-[#252525] hover:bg-[#EFEFEA] border border-[#E7E7E2]'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>Follow-Up Message</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isDirty && (
              <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Unsaved edits
              </span>
            )}
            {saveMessage && (
              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                <Check className="w-3 h-3" /> {saveMessage}
              </span>
            )}
            <button
              onClick={handleSaveDraftChanges}
              disabled={saving || !isDirty}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-[#252525] border border-[#D5D5D0] hover:bg-[#FAF9F5] transition-colors disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5 text-[#2B6CB0]" />
              <span>{saving ? 'Saving...' : 'Save Draft Edits'}</span>
            </button>
          </div>
        </div>

        {/* Content Box */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {business.isSuppressed && (
            <div className="p-3.5 rounded-lg bg-[#FDE8E8] border border-[#F8B4B4] text-[#9B1C1C] text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                <strong>Prospect is on the Do Not Contact (Suppression) List.</strong> Copy customization is active for preview and offline use, but outbound email dispatch is disabled.
              </span>
            </div>
          )}

          {generating ? (
            <div className="p-12 text-center space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-[#78B9E8] mx-auto" />
              <p className="text-xs text-[#777777]">
                Synthesizing custom revenue infrastructure pitch for {business.name}...
              </p>
            </div>
          ) : draft ? (
            <div className="space-y-4">
              {/* Editable Subject Line */}
              {channel === 'email' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-[#555555] uppercase tracking-wider">
                      Subject Line (Click to Edit)
                    </label>
                    <span className="text-[11px] text-[#777777]">
                      Domain: {business.normalizedDomain || 'custom'}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={customSubject}
                    onChange={(e) => {
                      setCustomSubject(e.target.value);
                      setIsDirty(true);
                    }}
                    className="w-full p-2.5 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2] text-xs font-medium text-[#252525] focus:bg-white focus:border-[#78B9E8] focus:outline-hidden transition-colors"
                  />
                </div>
              )}

              {/* Editable Message Body */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-semibold text-[#555555] uppercase tracking-wider">
                      Personalized Message Body (Directly Editable)
                    </label>
                    <span className="text-[10px] text-[#2B6CB0] bg-[#EBF5FB] px-1.5 py-0.2 rounded font-medium">
                      Tailored per business
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => fetchOrGenerateDraft(channel, { dealSize, demoUrl, brandSignoff })}
                      disabled={generating}
                      className="flex items-center gap-1 text-[11px] text-[#555555] hover:text-[#252525]"
                      title="Reset and regenerate"
                    >
                      <RotateCcw className="w-3 h-3 text-[#78B9E8]" />
                      <span>Regenerate</span>
                    </button>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1 text-[11px] text-[#2B6CB0] hover:underline font-medium"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copied!' : 'Copy Text'}</span>
                    </button>
                  </div>
                </div>

                <textarea
                  rows={14}
                  value={customContent}
                  onChange={(e) => {
                    setCustomContent(e.target.value);
                    setIsDirty(true);
                  }}
                  className="w-full p-3.5 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2] text-xs text-[#252525] font-mono leading-relaxed focus:bg-white focus:border-[#78B9E8] focus:outline-hidden transition-colors"
                  placeholder="Draft content..."
                />
              </div>

              {/* Operator Approval Toggle */}
              <div className="p-3.5 rounded-xl bg-[#F7F7F4] border border-[#E7E7E2] flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-[#252525]">Operator Review & Final Approval</div>
                  <div className="text-[11px] text-[#777777] mt-0.5">
                    Confirm that this custom copy accurately reflects the prospect's workflow and opportunity.
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isApproved}
                    disabled={business.isSuppressed}
                    onChange={handleApproveToggle}
                    className="w-4 h-4 rounded border-[#CCCCCC] text-[#78B9E8] focus:ring-[#78B9E8]"
                  />
                  <span className="text-xs font-medium text-[#252525]">
                    {isApproved ? 'Approved' : 'Mark Approved'}
                  </span>
                </label>
              </div>

              {/* Send Result */}
              {sendResult && (
                <div
                  className={`p-3.5 rounded-lg text-xs flex items-center gap-2 ${
                    sendResult.success
                      ? 'bg-[#EAF7EE] border border-[#C6ECD2] text-[#1D7A41]'
                      : 'bg-[#FDE8E8] border border-[#F8B4B4] text-[#9B1C1C]'
                  }`}
                >
                  {sendResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                  )}
                  <span>{sendResult.message}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#E7E7E2] bg-[#F7F7F4] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#777777]">
            Recipient: <span className="text-[#252525] font-mono font-medium">{business.email || business.phone || 'No direct channel found'}</span>
          </div>

          <div className="flex items-center gap-2">
            {mailtoUrl && (
              <a
                href={mailtoUrl}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-[#252525] border border-[#E7E7E2] hover:bg-[#EFEFEA] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#78B9E8]" />
                <span>Open in Mail Client</span>
              </a>
            )}

            <button
              onClick={handleSend}
              disabled={!isApproved || sending || business.isSuppressed}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-[#78B9E8] hover:bg-[#68A9D8] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Sending...' : 'Record & Send'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
