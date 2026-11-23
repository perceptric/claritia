// Ready-made sets of custom fields a workspace can add in one click (Settings > Fields).

import { type FieldKind } from "./fields.ts";

/** Ready-made field sets, like Omniscient's packs. */
export const PACKS: { key: string; label: string; object: "contact" | "company"; fields: { label: string; type: FieldKind; options?: string[] }[] }[] = [
  {
    key: "bant",
    label: "BANT",
    object: "contact",
    fields: [
      { label: "Budget", type: "currency" },
      { label: "Authority", type: "select", options: ["Decision maker", "Influencer", "User", "Unknown"] },
      { label: "Need", type: "long_text" },
      { label: "Timeline", type: "select", options: ["This quarter", "Next quarter", "This year", "Later"] },
    ],
  },
  {
    key: "inbound",
    label: "Inbound",
    object: "contact",
    fields: [
      { label: "First touch", type: "select", options: ["Search", "AI answer", "Social", "Referral", "Event", "Ads", "Direct"] },
      { label: "First conversion", type: "text" },
      { label: "Interests", type: "multi_select", options: ["Product", "Pricing", "Security", "Integrations", "Case studies"] },
    ],
  },
  {
    key: "meddic",
    label: "MEDDIC",
    object: "contact",
    fields: [
      { label: "Metrics", type: "long_text" },
      { label: "Economic buyer", type: "text" },
      { label: "Decision criteria", type: "long_text" },
      { label: "Decision process", type: "long_text" },
      { label: "Identified pain", type: "long_text" },
      { label: "Champion", type: "checkbox" },
    ],
  },
  {
    key: "buying_group",
    label: "Buying group",
    object: "contact",
    fields: [
      { label: "Buying role", type: "select", options: ["Decision maker", "Champion", "Influencer", "User", "Finance", "Blocker"] },
      { label: "Seniority", type: "select", options: ["C-level", "VP", "Director", "Manager", "Individual"] },
      { label: "Department", type: "select", options: ["Marketing", "Sales", "Engineering", "Product", "Finance", "HR", "Operations", "Other"] },
    ],
  },
  {
    key: "saas_account",
    label: "SaaS account",
    object: "company",
    fields: [
      { label: "Plan", type: "select", options: ["Free", "Starter", "Growth", "Enterprise"] },
      { label: "ARR", type: "currency" },
      { label: "Seats", type: "number" },
      { label: "Renewal date", type: "date" },
      { label: "Health", type: "select", options: ["Good", "At risk", "Churning"] },
    ],
  },
];
