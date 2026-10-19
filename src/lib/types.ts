// Shapes of the rows and RPC results the app reads. Kept by hand to match
// supabase/migrations.

export type BookingStatus =
  | "awaiting_payment"
  | "new"
  | "assigned"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type PaymentStatus =
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "not_required";

export type VisitWindow = "morning" | "afternoon" | "any";
export type Insurance = "none" | "alberta_blue_cross" | "vac" | "other";
export type StaffRole = "none" | "admin" | "nurse";

export type Settings = {
  online_booking_enabled: boolean;
  min_lead_days: number;
  max_days_ahead: number;
  gst_rate_bps: number;
  require_mfa: boolean;
  booking_notice: string | null;
};

export type ServiceArea = {
  id: string;
  name: string;
  surcharge_cents: number;
  active: boolean;
  sort_order: number;
};

export type CatalogItem = {
  id: string;
  kind: "service" | "product" | "fee";
  name: string;
  description: string | null;
  duration_min: number | null;
  price_cents: number;
  taxable: boolean;
  bookable_online: boolean;
  active: boolean;
  payroll_code: string | null;
  sort_order: number;
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: StaffRole;
  active: boolean;
};

export type Nurse = {
  id: string;
  profile_id: string | null;
  full_name: string;
  designation: "LPN" | "RN" | "HCA" | "Other";
  phone: string | null;
  email: string | null;
  active: boolean;
  notes: string | null;
};

export type Client = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  area_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_relationship: string | null;
  care_notes: string | null;
  staff_notes: string | null;
  source: string;
  external_ref: string | null;
  created_at: string;
};

export type Booking = {
  id: string;
  reference: string;
  client_id: string;
  status: BookingStatus;
  payment_status: PaymentStatus;
  source: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_relationship: string | null;
  area_id: string | null;
  location_type: "home" | "residence" | "other";
  residence_name: string | null;
  visit_address_line1: string;
  visit_address_line2: string | null;
  visit_city: string;
  visit_postal_code: string | null;
  preferred_date: string;
  alternate_date: string | null;
  preferred_window: VisitWindow;
  concerns: string[];
  client_notes: string | null;
  insurance: Insurance;
  nurse_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  duration_min: number | null;
  staff_notes: string | null;
  visit_notes: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  confirmed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
};

export type BookingItem = {
  id: string;
  booking_id: string;
  catalog_item_id: string | null;
  kind: "service" | "product" | "fee";
  name: string;
  payroll_code: string | null;
  quantity: number;
  unit_price_cents: number;
  taxable: boolean;
  line_total_cents: number;
};

export type Transaction = {
  id: string;
  booking_id: string | null;
  type: "payment" | "refund" | "adjustment";
  method: "card" | "cash" | "etransfer" | "cheque" | "insurance" | "demo" | "other";
  amount_cents: number;
  note: string | null;
  occurred_at: string;
  stripe_payment_intent_id: string | null;
  stripe_refund_id: string | null;
};

export type DispatchRow = {
  id: string;
  reference: string;
  status: BookingStatus;
  payment_status: PaymentStatus;
  source: string;
  preferred_date: string;
  alternate_date: string | null;
  preferred_window: VisitWindow;
  scheduled_start: string | null;
  scheduled_end: string | null;
  created_at: string;
  total_cents: number;
  location_type: string;
  residence_name: string | null;
  visit_city: string;
  insurance: Insurance;
  client_name: string;
  area_id: string | null;
  area_name: string | null;
  nurse_id: string | null;
  nurse_name: string | null;
  services: string[];
};

export type BookingDetail = {
  booking: Booking;
  client: Client;
  area: { id: string; name: string } | null;
  nurse: { id: string; full_name: string; phone: string | null } | null;
  items: BookingItem[];
  transactions: Transaction[];
};

export type NurseLoad = {
  id: string;
  full_name: string;
  designation: string;
  covers_area: boolean;
  areas: string[];
  visit_count: number;
  visits: {
    id: string;
    reference: string;
    status: BookingStatus;
    scheduled_start: string;
    scheduled_end: string;
    area_name: string | null;
  }[];
};

export type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  contact_name: string | null;
  booking_count: number;
  last_visit: string | null;
};

export type ClientDetail = {
  client: Client;
  bookings: {
    id: string;
    reference: string;
    status: BookingStatus;
    payment_status: PaymentStatus;
    preferred_date: string;
    scheduled_start: string | null;
    total_cents: number;
    nurse_name: string | null;
    services: string[];
  }[];
};

export type LedgerRow = {
  id: string;
  occurred_at: string;
  type: Transaction["type"];
  method: Transaction["method"];
  amount_cents: number;
  note: string | null;
  external_ref: string | null;
  stripe_payment_intent_id: string | null;
  stripe_refund_id: string | null;
  booking_id: string | null;
  reference: string | null;
  client_name: string | null;
};

export type PayrollRow = {
  visit_date: string;
  reference: string;
  nurse_name: string | null;
  client_name: string;
  area_name: string | null;
  item_name: string;
  kind: string;
  payroll_code: string | null;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  payment_status: PaymentStatus;
};

export type MyVisit = {
  id: string;
  reference: string;
  status: BookingStatus;
  scheduled_start: string;
  scheduled_end: string;
  location_type: string;
  residence_name: string | null;
  visit_address_line1: string;
  visit_address_line2: string | null;
  visit_city: string;
  visit_postal_code: string | null;
  concerns: string[];
  client_notes: string | null;
  visit_notes: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_relationship: string | null;
  client_name: string;
  client_phone: string | null;
  care_notes: string | null;
  services: string[];
};

export type Quote = {
  items: {
    catalog_item_id: string | null;
    kind: string;
    name: string;
    quantity: number;
    unit_price_cents: number;
    taxable: boolean;
  }[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  duration_min: number | null;
};
