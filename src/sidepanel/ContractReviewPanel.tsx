import { useEffect, useState } from 'react';
import type {
  ContractCaptureBatch,
  ContractStatus,
  ContractType,
  ExtractedContract,
} from '../shared/types';
import { saveContractBatch } from '../shared/services/contract-storage';
import { sendExtensionMessage } from '../shared/utils/messaging';
import { FieldEditor } from '../shared/components/FieldEditor';
import { StatusAlert } from '../shared/components/StatusAlert';
import { formatThrownError } from '../shared/utils/api-error-messages';
import { FlexHRMApiError } from '../shared/services/flexhrm-api';

interface Props {
  batch: ContractCaptureBatch;
  onBatchChange: (batch: ContractCaptureBatch) => void;
  onSaved: () => void;
}

function contractKey(contract: ExtractedContract): string {
  return (contract.gemContractPdfUrl || contract.contractNo).toUpperCase();
}

export function ContractReviewPanel({ batch, onBatchChange, onSaved }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [existingKeys, setExistingKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorAlert, setErrorAlert] = useState<{
    title: string;
    message: string;
    hint?: string;
  } | null>(null);

  const contract = batch.contracts[selectedIdx];

  useEffect(() => {
    void sendExtensionMessage({ type: 'CHECK_CONTRACT_DUPLICATES', payload: batch }).then(
      (res) => {
        setExistingKeys((res?.existing as string[] | undefined) ?? []);
      },
    );
  }, [batch.id]);

  const updateContract = (patch: Partial<ExtractedContract>) => {
    const contracts = [...batch.contracts];
    contracts[selectedIdx] = { ...contracts[selectedIdx], ...patch };
    const updated = { ...batch, contracts, updatedAt: new Date().toISOString() };
    onBatchChange(updated);
    saveContractBatch(updated);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setMessage('');
    setErrorAlert(null);
    try {
      const result = await sendExtensionMessage({
        type: 'SAVE_CONTRACT_BATCH',
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
            message: (result as { error?: string })?.error || 'Extension could not save contracts.',
          });
        }
        return;
      }
      setMessage(
        `Saved ${result?.created ?? 0} new, updated ${result?.updated ?? 0}, skipped ${result?.skipped ?? 0} contract(s).`,
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

  if (!contract) {
    return <p className="text-sm text-slate-500">No contracts in this batch.</p>;
  }

  const isDuplicate = existingKeys.includes(contractKey(contract));

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-orange-50 p-3 text-sm text-orange-900">
        <strong>{batch.contracts.length}</strong> GeM order(s) ready for FlexHRM Contracts
      </div>

      {existingKeys.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">{existingKeys.length} contract(s) already exist in FlexHRM</p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {batch.contracts.map((c, i) => (
          <button
            key={`${c.contractNo}-${i}`}
            type="button"
            onClick={() => setSelectedIdx(i)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium ${
              i === selectedIdx
                ? 'bg-orange-600 text-white'
                : existingKeys.includes(contractKey(c))
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-700'
            }`}
          >
            {c.contractNo.replace('GEMC-', '')}
          </button>
        ))}
      </div>

      {isDuplicate && (
        <p className="text-sm font-medium text-amber-700">
          This contract already exists — it will be updated on import.
        </p>
      )}

      <div className="grid gap-3">
        <FieldEditor
          label="Contract PDF link (saved as Contract No)"
          field="gemContractPdfUrl"
          value={contract.gemContractPdfUrl}
          onChange={(v) => updateContract({ gemContractPdfUrl: v })}
        />
        <FieldEditor
          label="GeM Contract Number"
          field="contractNo"
          value={contract.contractNo}
          onChange={(v) => updateContract({ contractNo: v })}
        />
        <FieldEditor
          label="Buyer / Officer"
          field="officerName"
          value={contract.officerName}
          onChange={(v) => updateContract({ officerName: v })}
        />
        <FieldEditor
          label="Organisation / Office"
          field="officeName"
          value={contract.officeName}
          onChange={(v) => updateContract({ officeName: v })}
        />
        <FieldEditor
          label="Address"
          field="correspondingOffice"
          value={contract.correspondingOffice}
          onChange={(v) => updateContract({ correspondingOffice: v })}
        />
        <FieldEditor
          label="Seller / Company"
          field="companyName"
          value={contract.companyName}
          onChange={(v) => updateContract({ companyName: v })}
        />
        <FieldEditor
          label="Category / Product"
          field="category"
          value={contract.category}
          onChange={(v) => updateContract({ category: v })}
        />
        <FieldEditor
          label="Bid Number"
          field="tenderBidNo"
          value={contract.tenderBidNo}
          onChange={(v) => updateContract({ tenderBidNo: v })}
        />
        <FieldEditor
          label="Contract Date"
          field="fromDate"
          value={contract.fromDate}
          onChange={(v) => updateContract({ fromDate: v })}
        />
        <FieldEditor
          label="End Date"
          field="toDate"
          value={contract.toDate}
          onChange={(v) => updateContract({ toDate: v })}
        />
        <FieldEditor
          label="Contract Value"
          field="contractValue"
          value={contract.contractValue}
          onChange={(v) => updateContract({ contractValue: v })}
        />
        {contract.gemContractPdfUrl && (
          <div>
            <span className="text-xs font-semibold text-slate-500">Contract PDF</span>
            <a
              href={contract.gemContractPdfUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-sm text-blue-600 underline break-all"
            >
              Open contract PDF
            </a>
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-500">Contract Type</label>
          <select
            value={contract.contractType}
            onChange={(e) => updateContract({ contractType: e.target.value as ContractType })}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="manpower">Manpower</option>
            <option value="travel">Travel</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Status</label>
          <select
            value={contract.status}
            onChange={(e) => updateContract({ status: e.target.value as ContractStatus })}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="active">Active</option>
            <option value="upcoming">Upcoming</option>
            <option value="expired">Expired</option>
            <option value="extended">Extended</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>
        <FieldEditor label="Notes" field="notes" value={contract.notes} onChange={(v) => updateContract({ notes: v })} />
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
        {saving ? 'Saving to FlexHRM…' : `Save All ${batch.contracts.length} Contracts to FlexHRM`}
      </button>
    </div>
  );
}
