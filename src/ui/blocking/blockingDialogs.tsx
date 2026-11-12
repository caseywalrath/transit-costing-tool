import { useState } from 'react';
import { ModalDialog } from '../ModalDialog';

/** Count wording for Blocking dialogs and their text: "1 block", "2 blocks", "0 activities". */
export function plural(count: number, singular: string, pluralForm = singular + 's') { return `${count} ${count === 1 ? singular : pluralForm}`; }

export function NameDialog({ title, initialValue, submitLabel, busy, onSubmit, onClose }: { title: string; initialValue: string; submitLabel: string; busy: boolean; onSubmit: (value: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initialValue);
  return <ModalDialog as="form" label={title} className="confirm-dialog" onSubmit={(event) => { event.preventDefault(); if (value.trim()) onSubmit(value.trim()); }} onClose={onClose} busy={busy}><h2>{title}</h2><label className="dialog-field">Name<input autoFocus value={value} onChange={(event) => setValue(event.target.value)} /></label><div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !value.trim()} type="submit">{busy ? 'Saving…' : submitLabel}</button></div></ModalDialog>;
}

export function Confirm({ title, text, label, busy, onConfirm, onClose }: { title: string; text: string; label: string; busy: boolean; onConfirm: () => void; onClose: () => void }) { return <ModalDialog role="alertdialog" label={title} className="confirm-dialog" onClose={onClose}><h2>{title}</h2><p>{text}</p><div className="dialog-actions"><button autoFocus disabled={busy} onClick={onClose}>Cancel</button><button className="danger" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : label}</button></div></ModalDialog>; }
