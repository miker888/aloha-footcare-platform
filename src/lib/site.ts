// Business details and website copy in one place.

export const site = {
  name: "Aloha Footcare Services",
  shortName: "Aloha Footcare",
  tagline: "Feel like you're walking along a sandy beach.",
  description:
    "Advanced foot care from licensed practical nurses, at home or in your seniors' residence, across Calgary and area. Diabetic foot care, thick and fungal nails, ingrown nails, corns and calluses.",
  phone: { display: "(587) 416-0377", href: "tel:+15874160377" },
  phoneAlt: { display: "(587) 962-5779", href: "tel:+15879625779" },
  email: "info@alohafootcareservices.ca",
  address: ["330 5th Avenue SW, Suite 1800", "Tower One", "Calgary, AB T2P 0L4"],
  social: {
    facebook: "https://www.facebook.com/profile.php?id=61573021906207",
    instagram: "https://www.instagram.com/alohafootcare/",
  },
} as const;

export const conditions = [
  { name: "Thick nails", text: "Nails too hard to cut at home, thinned and trimmed safely." },
  { name: "Fungal nails", text: "Discoloured, thick or lifting nails. The earlier they're treated, the easier they are to manage." },
  { name: "Ingrown nails", text: "Relief for painful edges, plus advice to help stop them coming back." },
  { name: "Corns and calluses", text: "Hard skin reduced gently, so walking feels comfortable again." },
  { name: "Cracked heels", text: "Care for dry, split skin before it turns painful or infected." },
  { name: "Diabetic foot care", text: "Careful nail and skin care, with a check for problems you might not feel." },
] as const;

export const steps = [
  {
    title: "Request a visit",
    text: "Choose a service and a day that suits you, then pay online to hold your request.",
  },
  {
    title: "We match your nurse",
    text: "We pick a nurse who covers your area and contact you to confirm the time.",
  },
  {
    title: "Your nurse comes to you",
    text: "Each visit starts with a check of your feet. Most visits take 30 to 45 minutes.",
  },
] as const;

export const places = [
  {
    title: "At home",
    text: "Anywhere in Calgary. A travel charge applies outside the city, and the booking form shows it before you pay.",
  },
  {
    title: "In seniors' residences",
    text: "Regular foot care for residents, on site. Residence staff can arrange group visits with us directly.",
  },
  {
    title: "Rural and remote communities",
    text: "We travel to communities beyond Calgary. Call us to plan a visit.",
  },
] as const;

// As listed on the current website.
export const partners = [
  "Alberta Health Services",
  "Veterans Affairs Canada",
  "Chartwell",
  "Carewest",
  "Covenant Living",
  "Signature Retirement Living",
  "AgeCare",
  "Intercare",
  "Prince of Peace Verve",
  "All Seniors Care Living Centres",
  "GoldenLife",
  "Comfort Keepers",
  "Perennial Care",
  "Ohana Care",
] as const;
