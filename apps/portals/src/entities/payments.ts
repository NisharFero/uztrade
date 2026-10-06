/* The payment gateway: bank transfers the agent files on the trader's behalf.
 *
 * The agent sends what the payment is (payer account, payee, amount, the
 * invoice or offer it settles, the case's payment reference) and the trader's
 * authorisation. The gateway checks the transfer against what it settles and
 * against the registry, then books it and issues the receipt - or sends it
 * back with the reason, like any other entity. */

import type { Application, EntityDef, ReviewContext } from "../contract.ts";
import { num, type Flags } from "./common.ts";

/** Above this a transfer needs the bank's manual approval. */
export const SINGLE_PAYMENT_LIMIT_UZS = 500_000_000;

/** The platform's payment reference: <case id>-P<step>, e.g. UZ-2609-0005-P04. */
export const PAYMENT_REFERENCE = /\b[A-Z]{2}(?:-[A-Z0-9]+)+-P\d{2,3}\b/;

/** Sandbox rule: an account whose last four digits are 0000 has no funds. */
const EMPTY_ACCOUNT = /0000$/;

const money = (value: number) => `${Math.round(value).toLocaleString("en-US").replace(/,/g, " ")} UZS`;

/** An earlier approved payment settling the same document from the same payer. */
function alreadyPaid(fields: Record<string, string>, ctx: ReviewContext, self?: string): Application | undefined {
  const basis = (fields["basis.document"] ?? "").trim().toLowerCase();
  if (!basis) return undefined;
  return ctx
    .all()
    .find(
      (a) =>
        a.entity === "payments" &&
        a.service === "transfer" &&
        a.status === "approved" &&
        a.reference !== self &&
        a.fields["payer.inn"] === fields["payer.inn"] &&
        (a.fields["basis.document"] ?? "").trim().toLowerCase() === basis,
    );
}

/** The amount the settled document asks for: an approved registry application's
 *  outputs when it is one (e.g. Single Window payment details), else what the
 *  agent read off the document. */
function basisAmount(fields: Record<string, string>, ctx: ReviewContext): number {
  const referenced = ctx.find(fields["basis.document"] ?? "");
  const issued = referenced?.outputs.amount_uzs ?? referenced?.outputs.amount;
  return num((issued ?? fields["basis.amount"] ?? "").replace(/[^\d.]/g, ""));
}

export const payments: EntityDef = {
  id: "payments",
  name: "Payment gateway",
  site: "interbank payment gateway (sandbox)",
  prefix: "PG",
  keyEnv: "PORTAL_KEY_PAYMENTS",
  devKey: "pg-dev-key",
  services: [
    {
      id: "transfer",
      title: "Bank transfer",
      kind: "apply",
      description: "Pays an invoice, offer agreement or state fee from the trader's account and issues the receipt.",
      fields: [
        { key: "payer.inn", label: "Payer INN", type: "inn", required: true, hint: "the 9-digit taxpayer number of the account holder" },
        { key: "payer.name", label: "Payer name", type: "text", required: true },
        { key: "payer.account", label: "Payer account", type: "account", required: true, hint: "the 20-digit settlement account" },
        { key: "payer.bank_mfo", label: "Payer bank MFO", type: "mfo", required: true, hint: "the bank's 5-digit code" },
        { key: "payee.name", label: "Payee", type: "text", required: true },
        { key: "payee.account", label: "Payee account", type: "account", required: false, hint: "left empty, the gateway uses the payee's registered treasury account" },
        { key: "payment.amount", label: "Amount to pay, UZS", type: "number", min: 1, required: true },
        { key: "payment.currency", label: "Currency", type: "enum", options: ["UZS"], required: true },
        { key: "payment.purpose", label: "Payment purpose", type: "text", required: true, hint: "must carry the case's payment reference, e.g. UZ-2609-0005-P04" },
        { key: "basis.document", label: "Document being paid", type: "text", required: true, hint: "the invoice or offer agreement number" },
        { key: "basis.amount", label: "Amount on that document, UZS", type: "number", min: 0, required: false },
        {
          key: "payment.authorisation",
          label: "Payment authorisation",
          type: "enum",
          options: ["Authorised by account holder"],
          required: true,
          hint: "the account holder authorises this transfer",
        },
      ],
      review(f, ctx) {
        const flags: Flags = [];
        const amount = num(f["payment.amount"]);
        const due = basisAmount(f, ctx);
        if (Number.isFinite(due) && due > 0 && Math.abs(amount - due) >= 1) {
          flags.push({ field: "payment.amount", reason: `${f["basis.document"]} asks for ${money(due)}, the transfer is ${money(amount)}` });
        }
        if (amount > SINGLE_PAYMENT_LIMIT_UZS) {
          flags.push({ field: "payment.amount", reason: `Over the ${money(SINGLE_PAYMENT_LIMIT_UZS)} single-payment limit — split it or pay at the branch` });
        }
        if (!PAYMENT_REFERENCE.test(f["payment.purpose"] ?? "")) {
          flags.push({ field: "payment.purpose", reason: "The purpose has no payment reference (<case>-P<step>), so the payee can't match the money to the case" });
        }
        if (EMPTY_ACCOUNT.test(f["payer.account"] ?? "")) {
          flags.push({ field: "payer.account", reason: "Insufficient funds on this account" });
        }
        const paid = alreadyPaid(f, ctx);
        if (paid) {
          flags.push({ field: "basis.document", reason: `${f["basis.document"]} is already paid — receipt ${paid.reference} of ${paid.outputs.paid_at ?? paid.updatedAt.slice(0, 10)}` });
        }
        return flags;
      },
      issue: (app, { now }) => ({
        receipt_no: app.reference,
        transaction_id: `TX${now.getTime().toString(36).toUpperCase()}${app.reference.slice(-4)}`,
        status: "Paid",
        amount_paid: money(num(app.fields["payment.amount"])),
        payee: app.fields["payee.name"],
        payee_account: app.fields["payee.account"] || "registered treasury account",
        purpose: app.fields["payment.purpose"],
        paid_at: now.toISOString().slice(0, 10),
      }),
    },
  ],
};
