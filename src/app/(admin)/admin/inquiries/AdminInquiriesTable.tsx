'use client';

import { Fragment, useActionState, useState } from 'react';
import Link from 'next/link';

import {
  setInquiryStatusAction,
  setInquiryNotesAction,
  type InquiryActionResult,
} from '@/app/actions/admin/inquiries';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { cx } from '@/components/ui/cx';
import styles from './page.module.css';

export interface AdminInquiryRow {
  id: string;
  kind: 'question' | 'sourcing';
  subject: string;
  message: string;
  customerEmail: string;
  isFromAccount: boolean;
  productName: string | null;
  productSlug: string | null;
  status: 'new' | 'in_progress' | 'closed';
  adminNotes: string | null;
  receivedAt: string;
}

interface AdminInquiriesTableProps {
  inquiries: AdminInquiryRow[];
  emptyMessage: string;
}

const initialState: InquiryActionResult = {};

const STATUS_TONE = {
  new: 'warning',
  in_progress: 'info',
  closed: 'slate',
} as const;

export function AdminInquiriesTable({ inquiries, emptyMessage }: AdminInquiriesTableProps) {
  const [statusState, statusAction, isStatusPending] = useActionState(
    setInquiryStatusAction,
    initialState,
  );
  const [notesState, notesAction, isNotesPending] = useActionState(
    setInquiryNotesAction,
    initialState,
  );
  const isPending = isStatusPending || isNotesPending;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (inquiries.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <div>
      {statusState.error && <Alert tone="danger">{statusState.error}</Alert>}
      {statusState.message && <Alert tone="success">{statusState.message}</Alert>}
      {notesState.error && <Alert tone="danger">{notesState.error}</Alert>}
      {notesState.message && <Alert tone="success">{notesState.message}</Alert>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Kind</th>
              <th>About</th>
              <th>Received</th>
              <th>Status</th>
              <th className={styles.editCol}></th>
            </tr>
          </thead>
          <tbody>
            {inquiries.map((inquiry) => {
              const open = expandedId === inquiry.id;

              return (
                <Fragment key={inquiry.id}>
                  <tr className={cx(open && styles.rowOpen)}>
                    <td>
                      <div className={styles.subjectCell}>
                        <span className={styles.subject}>{inquiry.subject}</span>
                        <span className={styles.from}>
                          {inquiry.customerEmail}
                          {inquiry.isFromAccount ? ' · account' : ''}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Badge tone={inquiry.kind === 'sourcing' ? 'violet' : 'neutral'}>
                        {inquiry.kind}
                      </Badge>
                    </td>
                    <td className={styles.notesCell}>
                      {inquiry.productSlug && inquiry.productName ? (
                        <Link href={`/products/${inquiry.productSlug}`}>{inquiry.productName}</Link>
                      ) : (
                        // A sourcing request is about something we don't have.
                        <span className={styles.usageNone}>not in the catalog</span>
                      )}
                    </td>
                    <td className={styles.usageCell}>{inquiry.receivedAt}</td>
                    <td>
                      <Badge tone={STATUS_TONE[inquiry.status]}>
                        {inquiry.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className={styles.editCol}>
                      <button
                        type="button"
                        className={styles.editToggle}
                        onClick={() => setExpandedId(open ? null : inquiry.id)}
                        aria-expanded={open}
                        aria-controls={`inquiry-${inquiry.id}`}
                      >
                        {open ? 'Close' : 'Read'}
                      </button>
                    </td>
                  </tr>

                  {open && (
                    <tr className={styles.detailRow}>
                      <td colSpan={6} id={`inquiry-${inquiry.id}`}>
                        <div className={styles.detailGrid}>
                          <div className={cx(styles.detailPanel, styles.detailWide)}>
                            <h3 className={styles.detailTitle}>Message</h3>
                            <p className={styles.message}>{inquiry.message}</p>
                          </div>

                          <div className={styles.detailPanel}>
                            <h3 className={styles.detailTitle}>Reply</h3>
                            {/* No reply-from-here: outbound mail goes through
                                one sender with no threading, so replying in a
                                real mail client is the honest option. */}
                            <p className={styles.deleteNote}>
                              <a href={`mailto:${inquiry.customerEmail}?subject=${encodeURIComponent(`Re: ${inquiry.subject}`)}`}>
                                Reply to {inquiry.customerEmail} →
                              </a>
                            </p>
                          </div>

                          <div className={styles.detailPanel}>
                            <h3 className={styles.detailTitle}>Notes</h3>
                            <form action={notesAction} className={styles.editForm}>
                              <input type="hidden" name="id" value={inquiry.id} />
                              <Input
                                type="text"
                                name="notes"
                                defaultValue={inquiry.adminNotes ?? ''}
                                placeholder="What you found out, what you quoted…"
                                maxLength={2000}
                                aria-label="Internal notes"
                              />
                              <div className={styles.formActions}>
                                <Button type="submit" variant="secondary" disabled={isPending}>
                                  Save notes
                                </Button>
                              </div>
                            </form>
                          </div>

                          <div className={styles.detailActions}>
                            <form action={statusAction} className={styles.statusForm}>
                              <input type="hidden" name="id" value={inquiry.id} />
                              {inquiry.status !== 'in_progress' && (
                                <Button
                                  type="submit"
                                  name="status"
                                  value="in_progress"
                                  variant="secondary"
                                  disabled={isPending}
                                >
                                  Working on it
                                </Button>
                              )}
                              {inquiry.status !== 'closed' ? (
                                <Button type="submit" name="status" value="closed" disabled={isPending}>
                                  Close
                                </Button>
                              ) : (
                                <Button
                                  type="submit"
                                  name="status"
                                  value="new"
                                  variant="secondary"
                                  disabled={isPending}
                                >
                                  Reopen
                                </Button>
                              )}
                            </form>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
