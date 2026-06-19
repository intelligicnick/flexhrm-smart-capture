import { useEffect, useState } from 'react';
import type { ExtractedTender, TenderCaptureBatch, TenderType } from '../shared/types';
import { saveTenderBatch } from '../shared/services/tender-storage';
import { sendExtensionMessage } from '../shared/utils/messaging';
import { FieldEditor } from '../shared/components/FieldEditor';
import { StatusAlert } from '../shared/components/StatusAlert';
import { formatThrownError } from '../shared/utils/api-error-messages';
import { FlexHRMApiError } from '../shared/services/flexhrm-api';

interface Props {
  batch: TenderCaptureBatch;
  onBatchChange: (batch: TenderCaptureBatch) => void;
  onSaved: () => void;
}

export function TenderReviewPanel({ batch, onBatchChange, onSaved }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [existingBids, setExistingBids] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorAlert, setErrorAlert] = useState<{
    title: string;
    message: string;
    hint?: string;
  } | null>(null);

  const tender = batch.tenders[selectedIdx];

  useEffect(() => {
    void sendExtensionMessage({ type: 'CHECK_TENDER_DUPLICATES', payload: batch }).then((res) => {
      setExistingBids((res?.existing as string[] | undefined) ?? []);
    });
  }, [batch.id]);

  const updateTender = (patch: Partial<ExtractedTender>) => {
    const tenders = [...batch.tenders];
    tenders[selectedIdx] = { ...tenders[selectedIdx], ...patch };
    const updated = { ...batch, tenders, updatedAt: new Date().toISOString() };
    onBatchChange(updated);
    saveTenderBatch(updated);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setMessage('');
    setErrorAlert(null);
    try {
      const result = await sendExtensionMessage({
        type: 'SAVE_TENDER_BATCH',
        payload: batch,
      });
      if (!result?.success) {
        const facing = (result as { userFacing?: { title: string; message: string; hint?: string } })
          ?.userFacing;
        if (facing) {
          setErrorAlert(facing);
        } else {
          setErrorAlert({
            title: 'Save failed',
            message: (result as { error?: string })?.error || 'Extension could not save tenders.',
          });
        }
        return;
      }
      setMessage(
        `Saved ${result?.created ?? 0} new, updated ${result?.updated ?? 0}, skipped ${result?.skipped ?? 0} tender(s).`,
      );
      onSaved();
    } catch (err) {
      const facing =
        err instanceof FlexHRMApiError ? err.userFacing : formatThrownError(err, 'save');
      setErrorAlert(facing);
    } finally {
      setSaving(false);
    }
  };

  if (!tender) {
    return <p className="text-sm text-slate-500">No tenders in this batch.</p>;
  }

  const isDuplicate = existingBids.includes(tender.bidNo.toUpperCase());

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
        <strong>{batch.tenders.length}</strong> selected GeM tender(s) ready for review
      </div>

      {existingBids.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">{existingBids.length} bid(s) already exist in FlexHRM</p>
          <p className="mt-1 text-xs">{existingBids.join(', ')}</p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {batch.tenders.map((t, i) => (
          <button
            key={t.bidNo}
            type="button"
            onClick={() => setSelectedIdx(i)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium ${
              i === selectedIdx
                ? 'bg-blue-600 text-white'
                : existingBids.includes(t.bidNo.toUpperCase())
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-700'
            }`}
          >
            {t.bidNo.replace('GEM/', '')}
          </button>
        ))}
      </div>

      {isDuplicate && (
        <p className="text-sm font-medium text-amber-700">
          This bid already exists — it will be skipped on import.
        </p>
      )}

      <div className="grid gap-3">
        <FieldEditor label="Bid No" field="bidNo" value={tender.bidNo} onChange={(v) => updateTender({ bidNo: v })} />
        <FieldEditor label="Entry Date" field="entryDate" value={tender.entryDate} onChange={(v) => updateTender({ entryDate: v })} />
        <FieldEditor label="Items / Category" field="category" value={tender.category} onChange={(v) => updateTender({ category: v, gemItems: v })} />
        <FieldEditor label="Ministry / State" field="ministry" value={tender.ministry} onChange={(v) => updateTender({ ministry: v })} />
        <FieldEditor label="Organisation" field="organisation" value={tender.organisation || tender.department} onChange={(v) => updateTender({ organisation: v, department: v })} />
        <FieldEditor label="Consignee Officer" field="consigneeOfficer" value={tender.consigneeOfficer || tender.officerName} onChange={(v) => updateTender({ consigneeOfficer: v, officerName: v })} />
        <FieldEditor label="Address" field="address" value={tender.address} onChange={(v) => updateTender({ address: v })} />
        <FieldEditor label="Quantity (GeM)" field="gemQuantity" value={tender.gemQuantity} onChange={(v) => updateTender({ gemQuantity: v })} />
        <FieldEditor label="Additional Requirements" field="additionalRequirements" value={tender.additionalRequirements} onChange={(v) => updateTender({ additionalRequirements: v })} />
        <FieldEditor label="Bid End Date/Time" field="endDate" value={tender.endDate || tender.gemEndDate} onChange={(v) => updateTender({ endDate: v, gemEndDate: v })} />
        <FieldEditor label="Pre-Bid Date & Time" field="preBidAt" value={tender.preBidAt} onChange={(v) => updateTender({ preBidAt: v, noPreBid: !v && !tender.preBidVenue })} />
        <FieldEditor label="Pre-Bid Venue" field="preBidVenue" value={tender.preBidVenue} onChange={(v) => updateTender({ preBidVenue: v, noPreBid: !v && !tender.preBidAt })} />
        {tender.gemDocUrl && (
          <div>
            <span className="text-xs font-semibold text-slate-500">Bid PDF</span>
            <a
              href={tender.gemDocUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-sm text-blue-600 underline"
            >
              Open GeM document — then click Extract PDF Details
            </a>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-500">Tender Type</label>
          <select
            value={tender.tenderType}
            onChange={(e) => updateTender({ tenderType: e.target.value as TenderType })}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="manpower">Manpower</option>
            <option value="travel">Travel</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500">Status</label>
          <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Not Participated (set in FlexHRM after import)
          </p>
        </div>

        <FieldEditor label="Notes" field="notes" value={tender.notes} onChange={(v) => updateTender({ notes: v })} />
      </div>

      {errorAlert && (
        <StatusAlert
          tone="error"
          title={errorAlert.title}
          message={errorAlert.message}
          hint={errorAlert.hint}
        />
      )}

      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <button
        type="button"
        disabled={saving}
        onClick={handleSaveAll}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#ff791a] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving && (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        )}
        {saving ? 'Saving to FlexHRM…' : `Save All ${batch.tenders.length} Tenders to FlexHRM`}
      </button>
    </div>
  );
}
