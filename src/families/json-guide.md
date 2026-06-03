# Genograph JSON Schema Guide

Use this file as a reference when building a genograph JSON by hand or with an LLM.
Paste this document into your LLM conversation, describe the family, and ask it to produce a valid genograph JSON. Then load the result into Genograph using the **Load** button in the toolbar.

---

## Top-level structure

```json
{
  "meta": { "title": "Smith Family" },
  "persons": [...],
  "unions": [...],
  "familyRelations": [...],
  "bonds": [...]
}
```

`meta`, `familyRelations`, and `bonds` are optional.

---

## Person

```json
{
  "id": 1,
  "name": "Jane Smith",
  "sex": "F",
  "age": 42,
  "deceased": false,
  "isIndexPerson": true
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Unique within `persons`. Primary subject must be `1`. |
| `name` | string | Required. |
| `sex` | `"M"` / `"F"` / `"O"` / `"?"` | Required. O = non-binary, ? = unknown. |
| `age` | number | Optional. |
| `deceased` | boolean | Optional. Adds an X indicator to the person box. |
| `isIndexPerson` | boolean | `true` only on the primary subject (id `1`). |

---

## Union

```json
{
  "id": "u1",
  "partners": [1, 2],
  "type": "married",
  "status": "divorced",
  "quality": "green",
  "children": [3, 4]
}
```

| Field | Values | Notes |
|---|---|---|
| `id` | `"u1"`, `"u2"` … | Prefixed string. |
| `partners` | `[id, id]` | Exactly two person IDs. |
| `type` | `married` / `cohabiting` / `affair` / `other` / `unknown` | When `other`, add a `label` field with custom text. |
| `label` | string | Custom display text. Only used when `type` is `"other"`. |
| `status` | `active` / `separated` / `divorced` / `widowed` / `deceased` | Omit or use `active` for current relationships. |
| `quality` | `green` / `yellow` / `red` | Optional. Controls line color. |
| `children` | `[id, …]` | Optional. Person IDs of children from this union. |

**Label display rules:**
- Active relationship → shows type only: "Married", "Cohabiting", "Affair", or your custom label
- Ended relationship → shows status only: "Divorced", "Widowed", "Both Deceased"
- Exception: cohabiting or affair + separated → shows both: "Cohabiting, Separated"

---

## FamilyRelation

**Use sparingly.** For relationships that cannot be expressed through a union.

```json
{
  "id": "fr1",
  "from": 3,
  "to": 5,
  "type": "sibling",
  "quality": "yellow"
}
```

| Field | Values | Notes |
|---|---|---|
| `id` | `"fr1"`, `"fr2"` … | Prefixed string. |
| `from` | person id | — |
| `to` | person id | — |
| `type` | `parent` / `child` / `sibling` / `half-sibling` / `aunt` / `uncle` / `niece` / `nephew` | — |
| `quality` | `green` / `yellow` / `red` | Optional. |

**When to use each type:**

| Type | Use when… |
|---|---|
| `sibling` | Two people are siblings but **their parents are not in the diagram**. |
| `half-sibling` | Two people share one parent but come from **different unions** (e.g. Tyler and Alex are both Richard's children but by different mothers). |
| `aunt` / `uncle` | Person is an aunt or uncle of someone in the diagram — positions them on the parent generation row. |
| `parent` / `child` | A parent-child relationship where **no union exists** for the parent. |
| `niece` / `nephew` | Rarely needed; mainly for relationship labels. |

**Do NOT use `sibling` when both people are children of the same union.** Add both IDs to that union's `children` array instead — that produces the correct T-bar and layout automatically.

---

## Bond

Support-network connections (non-family relationships).

```json
{
  "id": "b1",
  "from": 1,
  "to": 6,
  "type": "mentor",
  "quality": "green"
}
```

| Field | Values | Notes |
|---|---|---|
| `id` | `"b1"`, `"b2"` … | Prefixed string. |
| `from` | person id | — |
| `to` | person id | — |
| `type` | `guardian` / `close-friend` / `counselor` / `mentor` / `caregiver` / `sponsor` / `important-adult` / `other` | When `other`, add a `label` field. |
| `label` | string | Custom label when `type` is `"other"`. |
| `quality` | `green` / `yellow` / `red` | Optional. |

---

## ID rules

- **Person IDs** are plain integers: `1`, `2`, `3` …
- **All other IDs** are prefixed strings: `"u1"`, `"fr1"`, `"b1"` …
- IDs must be unique within each array.
- The **primary subject always has id `1`** and `isIndexPerson: true`.

---

## Complete example

Three-generation family: parents divorced and remarried, a half-sibling, and a support bond.

```json
{
  "meta": { "title": "Sample Family" },
  "persons": [
    { "id": 1, "name": "Alex",    "sex": "M", "age": 35, "isIndexPerson": true },
    { "id": 2, "name": "Maria",   "sex": "F", "age": 33 },
    { "id": 3, "name": "Tom",     "sex": "M", "age": 62 },
    { "id": 4, "name": "Linda",   "sex": "F", "age": 59, "deceased": true },
    { "id": 5, "name": "Susan",   "sex": "F", "age": 55 },
    { "id": 6, "name": "Jamie",   "sex": "M", "age": 28 },
    { "id": 7, "name": "Dr. Lee", "sex": "?", "age": 50 }
  ],
  "unions": [
    {
      "id": "u1",
      "partners": [1, 2],
      "type": "married",
      "status": "active",
      "quality": "green"
    },
    {
      "id": "u2",
      "partners": [3, 4],
      "type": "married",
      "status": "divorced",
      "children": [1]
    },
    {
      "id": "u3",
      "partners": [3, 5],
      "type": "married",
      "status": "active",
      "children": [6]
    }
  ],
  "familyRelations": [
    { "id": "fr1", "from": 1, "to": 6, "type": "half-sibling" }
  ],
  "bonds": [
    { "id": "b1", "from": 1, "to": 7, "type": "counselor", "quality": "green" }
  ]
}
```

---

## LLM prompt hint

Paste this entire document into your LLM conversation, then say:

> "Generate a genograph JSON for [describe the family — names, relationships, ages, divorces, deaths, support people, etc.]. Follow the schema above exactly. The primary subject is [name], id 1."

Load the result into Genograph using the **Load** button in the toolbar.
