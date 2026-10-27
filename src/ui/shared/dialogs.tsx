import { type FormEvent, useState } from 'react';
import { ModalDialog } from '../ModalDialog';

export type NameDialog = { title: string; label?: string; initialValue?: string; submitLabel: string; action: (name: string) => Promise<void> | void };
export type Confirmation = { title: string; text: string; action: () => void; confirmLabel?: string };
export function DiscardRouteDraftDialog({ title, onDiscard, onClose }: { title: string; onDiscard: () => void; onClose: () => void }) {
  return <ModalDialog role="alertdialog" labelledBy="discard-route-draft-title" className="confirm-dialog" onClose={onClose}><h2 id="discard-route-draft-title">{title}</h2><p>These edits have not been saved.</p><div className="dialog-actions"><button autoFocus onClick={onClose}>Cancel</button><button className="danger" onClick={onDiscard}>Discard</button></div></ModalDialog>;
}

export function RouteNavigationDraftDialog({ title = 'Save route changes before leaving?', text = 'Nodes or a Pattern have unsaved edits.', onCancel, onDiscard, onSave }: { title?: string; text?: string; onCancel: () => void; onDiscard: () => void; onSave: () => void }) {
  return <ModalDialog role="alertdialog" labelledBy="route-navigation-draft-title" className="confirm-dialog" onClose={onCancel}><h2 id="route-navigation-draft-title">{title}</h2><p>{text}</p><div className="dialog-actions"><button autoFocus onClick={onCancel}>Cancel</button><button className="danger" onClick={onDiscard}>Discard</button><button className="primary" onClick={onSave}>Save</button></div></ModalDialog>;
}

export function NameDialogForm({ dialog, onClose }: { dialog: NameDialog; onClose: () => void }) {
  const [name, setName] = useState(dialog.initialValue ?? '');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!name.trim()) { setError('A name is required.'); return; } await dialog.action(name.trim()); onClose(); }
  return <ModalDialog as="form" labelledBy="name-dialog-title" className="confirm-dialog" onSubmit={(event) => void submit(event)} onClose={onClose}><h2 id="name-dialog-title">{dialog.title}</h2><label className="dialog-field" htmlFor="dialog-name"><span className={dialog.label ? undefined : 'visually-hidden'}>{dialog.label ?? 'Name'}</span><input id="dialog-name" autoFocus value={name} onChange={(event) => { setName(event.target.value); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'dialog-name-error' : undefined} /></label>{error && <p id="dialog-name-error" className="field-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">{dialog.submitLabel}</button></div></ModalDialog>;
}

export function ConfirmDialog({ dialog, onClose }: { dialog: Confirmation; onClose: () => void }) {
  return <ModalDialog role="alertdialog" labelledBy="confirm-title" className="confirm-dialog" onClose={onClose}><h2 id="confirm-title">{dialog.title}</h2><p>{dialog.text}</p><div><button autoFocus onClick={onClose}>Cancel</button><button className="danger" onClick={() => { dialog.action(); onClose(); }}>{dialog.confirmLabel ?? 'Confirm'}</button></div></ModalDialog>;
}

export function ShiftDiscardDialog({ title = 'Discard staged shift?', text = 'The selected Trips have not been changed. Discard the staged shift before leaving this schedule context?', onDiscard, onCancel }: { title?: string; text?: string; onDiscard: () => void; onCancel: () => void }) {
  return <ModalDialog labelledBy="shift-discard-title" className="confirm-dialog" onClose={onCancel}><h2 id="shift-discard-title">{title}</h2><p>{text}</p><div><button onClick={onCancel}>Cancel</button><button className="subtle-danger" onClick={onDiscard}>Discard</button></div></ModalDialog>;
}
