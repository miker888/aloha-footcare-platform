import type { BookingStatus, Insurance, PaymentStatus, Transaction, VisitWindow } from "./types";

export const CONCERNS: { value: string; label: string }[] = [
  { value: "thick_nails", label: "Thick nails" },
  { value: "fungal_nails", label: "Discoloured or fungal nails" },
  { value: "ingrown_nails", label: "Ingrown nails" },
  { value: "corns_calluses", label: "Corns or calluses" },
  { value: "cracked_heels", label: "Cracked heels" },
  { value: "diabetic", label: "Diabetes" },
  { value: "routine_care", label: "Routine nail care" },
  { value: "other", label: "Something else" },
];

export const concernLabel = (v: string) => CONCERNS.find((c) => c.value === v)?.label ?? v;

export const WINDOWS: { value: VisitWindow; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "any", label: "Any time" },
];

export const windowLabel = (v: VisitWindow) => WINDOWS.find((w) => w.value === v)?.label ?? v;

export const INSURANCE: { value: Insurance; label: string }[] = [
  { value: "none", label: "No, I'll pay myself" },
  { value: "alberta_blue_cross", label: "Alberta Blue Cross" },
  { value: "vac", label: "Veterans Affairs Canada" },
  { value: "other", label: "Other insurance" },
];

export const insuranceLabel = (v: Insurance) =>
  ({ none: "None", alberta_blue_cross: "Alberta Blue Cross", vac: "Veterans Affairs Canada", other: "Other insurance" })[v] ?? v;

export const STATUS: Record<BookingStatus, string> = {
  awaiting_payment: "Not paid yet",
  new: "Needs a nurse",
  assigned: "Waiting to confirm",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const PAYMENT: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Part paid",
  paid: "Paid",
  partially_refunded: "Part refunded",
  refunded: "Refunded",
  not_required: "No charge",
};

export const METHOD: Record<Transaction["method"], string> = {
  card: "Card",
  cash: "Cash",
  etransfer: "E-transfer",
  cheque: "Cheque",
  insurance: "Insurance",
  demo: "Demo",
  other: "Other",
};

export const TXN_TYPE: Record<Transaction["type"], string> = {
  payment: "Payment",
  refund: "Refund",
  adjustment: "Adjustment",
};
