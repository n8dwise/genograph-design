# Genograph — Project Context

Built for a therapist friend as a clinical family tree / genogram tool. Runs entirely in the browser; no backend, no server. Data never leaves the user's device.

## Repository

- **Local path**: `/Users/whitneybradford/ClaudesHome/genograph`
- **GitHub**: `github.com/n8dwise/genograph-design` (SSH remote: `git@github.com:n8dwise/genograph-design.git`)
- **Branch**: `main`
- **Deploy target**: GitHub Pages (free, not yet configured)

---

## Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | v26 (Homebrew) | Dev toolchain |
| npm | v11 | Package manager |
| TypeScript | ~5.8.2 | Language |
| Vite | ^7.3.1 | Dev server + bundler |
| `@joint/core` | 4.2.4 | Diagram rendering (JointJS) |
| `@joint/layout-directed-graph` | 4.2.3 | Dagre-based auto-layout |

### Dev commands
```
npm run dev       # start dev server (Vite, localhost:5173)
npm run build     # tsc + vite build → dist/
npm run preview   # preview production build
```

> **Note**: There are pre-existing `tsc` errors in `minimize-crossings.ts` and `storage.ts` that were present before our work. Vite's esbuild pipeline ignores them so `npm run dev` works fine; `npm run build` produces errors but the app still bundles.

---

## File Map

```
genograph/
├── index.html               # App shell — toolbar + split-pane layout
├── package.json
├── context.md               # This file
├── src/
│   ├── main.ts              # Entry point — JointJS setup, render loop, toolbar handlers
│   ├── data.ts              # Data model interfaces + adapter functions
│   ├── shapes.ts            # JointJS element + link classes
│   ├── theme.ts             # Colors, sizes, quality color helper
│   ├── editor.ts            # Left-panel UI — people / unions / family relations / bonds forms
│   ├── highlighters.ts      # Deceased X and index-person double border
│   ├── storage.ts           # Save JSON, load JSON, export PNG
│   ├── utils.ts             # createPersonElement helper
│   ├── styles.css           # All CSS
│   └── layout/
│       ├── index.ts         # Layout engine (Steps 1–5 + 3.5 + 3.6)
│       └── minimize-crossings.ts  # Barycenter crossing minimization
└── src/families/
    └── example.json         # Complex 4-generation sample (remarriage, half-siblings, deceased, bonds)
```

---

## Data Model (`src/data.ts`)

**Union-centric** — couple relationships are explicit Union objects. Family relations (parent, child, sibling, etc.) are a separate explicit array, not inferred.

```typescript
interface Person {
    id: number;
    name: string;
    sex: 'M' | 'F' | 'O' | '?';
    age?: number;           // shown inline after name: "John, 45"
    deceased?: boolean;     // renders small X in bottom-right corner of box
    isIndexPerson?: boolean; // primary subject — pinned first, no delete
    notes?: string;
}

interface Union {
    id: string;             // "u1", "u2", ...
    partners: [number, number];
    type?: 'married' | 'cohabiting' | 'affair' | 'unknown';
    status?: 'active' | 'separated' | 'divorced';
    quality?: 'green' | 'yellow' | 'red';  // stoplight — colors mate line
    children?: number[];    // person IDs
}

type FamilyRelationType =
    | 'parent' | 'child' | 'sibling' | 'half-sibling'
    | 'aunt' | 'uncle' | 'niece' | 'nephew';

interface FamilyRelation {
    id: string;             // "fr1", "fr2", ...
    from: number;           // the person described (e.g. "Tyler is half-sibling of Alex" → from=Tyler)
    to: number;             // the reference person
    type: FamilyRelationType;
    quality?: RelationshipQuality;
}

type BondType = 'guardian' | 'close-friend' | 'counselor' |
                'mentor' | 'caregiver' | 'sponsor' | 'important-adult' | 'other';

interface Bond {
    id: string;             // "b1", "b2", ...
    from: number;
    to: number;
    type: BondType;
    label?: string;         // custom label when type === 'other'
    quality?: RelationshipQuality;
}

type RelationshipQuality = 'green' | 'yellow' | 'red';

interface FamilyData {
    meta?: { title?: string; date?: string; };
    persons: Person[];
    unions: Union[];
    familyRelations?: FamilyRelation[];
    bonds?: Bond[];
}
```

### ID generation
- Person IDs: integers starting at 1 (`nextPersonId`)
- Union IDs: string prefixed `"u1"` (`nextUnionId`)
- FamilyRelation IDs: string prefixed `"fr1"` (`nextFamilyRelationId`)
- Bond IDs: string prefixed `"b1"` (`nextBondId`)
- Primary subject always gets `id: 1` and `isIndexPerson: true`

### Layout adapter
`getParentChildLinks(data)` merges union children AND family relations of type `'parent'`/`'child'`. Links from family relations carry `fromFamilyRelation: true` so the layout engine skips fan routing for them (they draw from the individual parent, not the couple midpoint).

`toLayoutPersonNodes()` converts `FamilyData` by inspecting unions — the female partner becomes mother, male becomes father (fallback: first partner = father). `'O'` sex maps to `'?'` for layout purposes.

---

## Shapes (`src/shapes.ts`)

All person shapes are **colored rectangles** (standard clinical style).

| Class | Fill | Stroke | Meaning |
|-------|------|--------|---------|
| `MalePerson` | `#dbeafe` | `#2563eb` | Male (blue) |
| `FemalePerson` | `#fce7f3` | `#db2777` | Female (rose) |
| `OtherPerson` | `#ede9fe` | `#7c3aed` | Other gender (purple) |
| `UnknownPerson` | `#e5e7eb` | `#6b7280` | Unknown (gray) |

Person boxes are 90×46px. Name text uses `textWrap: { width: 'calc(w - 10)', maxLineCount: 1, ellipsis: true }` to prevent overflow. Age is appended to name as `"Name, age"` string.

### Link classes
- `ParentChildLink` — slate gray (`#94a3b8`), no arrow, strokeWidth 1.5
- `MateLink` — color from quality stoplight, dasharray from status, label above line
- `FamilyRelationLink` — slate gray (`#64748b`), smooth connector, no arrow; used for sibling/aunt/uncle/etc. overlays
- `BondLink` — purple (`#7c3aed`), dashed `6 3`, smooth connector, floating label

### JointJS namespace registration (in `main.ts`)
```typescript
const cellNamespace = {
    ...shapes,
    genogram: { MalePerson, FemalePerson, OtherPerson, UnknownPerson,
                ParentChildLink, MateLink, FamilyRelationLink, BondLink },
};
```

---

## Theme (`src/theme.ts`)

```typescript
sizes = {
    symbolWidth: 90, symbolHeight: 46,
    coupleGap: 32, symbolGap: 28, levelGap: 90,
    paperPadding: 60, deceasedCrossInset: 5,
    nameMargin: 6, nameMaxLineCount: 2,
}

// Stoplight quality colors for mate lines
qualityStrokeColor(quality?) → string
// green=#16a34a  yellow=#ca8a04  red=#dc2626  undefined=#9ca3af
```

---

## Layout Engine (`src/layout/index.ts`)

Called from `main.ts` as `layoutGenogram(...)`. Accepts `familyRelations?: FamilyRelation[]`.

### Step 1 — Couple containers

Invisible rectangles sized to hold partners side-by-side. Used as dagre nodes so partners stay together. Three cases:

**Multi-partner hub** (person in 2+ unions): wide timeline container ordered as `[former partner(s)…, hub, active partner(s)…]`. This keeps all of a person's relationships in one dagre node — former marriages left, active marriage right. `multiPartnerInfos` array tracks `{ container, hubId, orderedIds, unionByPartner }`.

**Standard 2-person couple**: container sized `symbolWidth*2 + coupleGap + extraWidth`. `coupleInfos` array tracks `{ container, fromId, toId, unionId }`.

Both cases populate `coupledPersonIds` (set of all persons in any container), `mateOf` map (personId → partner's personId), and `personIdToContainer` map.

### Step 2 — Dagre layout

`DirectedGraph.layout()` with `rankDir: 'TB'`. `layoutId()` maps person IDs to their container ID (or self if solo). Duplicate layout edges (two people in same container sharing a child) are filtered before dagre and added back after. Crossing minimization via `minimizeCrossings` as `customOrder`.

### Step 3 — Couple positioning

After dagre positions containers, place person elements within them:
- Solo elements: dagre positioned them directly
- Standard couples: left partner = one with parents further left; right partner = other
- Multi-partner hubs: left→right order follows `orderedIds` from Step 1

`inset = symbolWidth/2` added in orthogonal link style to leave room for T-bar routing.

### Step 3.5 — Generational alignment (y-snap)

For each `sibling` or `half-sibling` family relation: snap `from` person's y to match `to` person's y. For `aunt`/`uncle`: snap to the parent generation y of their reference person. Snapping also moves the mated partner of the subject.

### Step 3.6 — Active-side child repositioning

For each multi-partner hub, children of **active** unions must appear to the **RIGHT** of children of **former** (divorced/separated) unions. Dagre's crossing minimization can place them on the wrong side; this step corrects it:

1. Split hub's `orderedIds` into `formerPartnerIds` (left of hub) and `activePartnerIds` (right of hub)
2. Collect former-side children and active-side children from respective unions
3. Find rightmost right-edge among all former-side children (and their mates, from `mateOf`)
4. Reposition active-side children starting at `rightmostEdge + symbolGap`
   - Solo children: move x only, preserve y
   - Coupled children: move both child and mate, preserving their left-right order

### Step 4 — T-bar routing

Remove dagre placeholder links, draw right-angle parent-child lines:

**Union-based T-bars** (all unions, including divorced):
- Spine: couple midpoint bottom → barY
- Horizontal bar: spanning all child centers
- Drops: barY → each child's top

**Family-relation parent/child**: right-angle elbow from individual parent (no T-bar).

`barDrop = levelGap * 0.35`. All segments colored by `qualityStrokeColor(union.quality)`.

Containers removed from graph at end of this step.

### Step 5 — Mate links

One `MateLink` per couple (standard or multi-partner), colored by quality, dashed by status:
- `'divorced'` → `strokeDasharray: '10 5'`
- `'separated'` → `strokeDasharray: '5 4'`
- Active → solid

Label above the line (`offset: -29`): `"Married, Divorced"` / `"Married"` / `"Cohabiting"` / `"Affair"`. Label omitted if type is `'unknown'` or undefined.

---

## Render Flow (`src/main.ts`)

```
showSetupScreen() on init
  → user enters primary subject name + sex
  → currentData.persons.push({ id:1, isIndexPerson:true, ... })
  → setEditorData(currentData)
  → render(currentData)

render(data):
  1. Compute structuralIds (in any union as partner/child, or in parent/child family relation)
  2. Split persons into structuralPersons + peripheralPersons
  3. layoutGenogram({ ..., familyRelations }) → places structurals in graph
  4. For each peripheralElement:
     - Has sibling relation? → placePeripheral(el, siblingEl, 'left')
     - Has uncle/aunt relation? → placePeripheral(el, parentEl, 'left')
     - Has bond to graph person? → collect in supportPersonElements[]
  5. Place supportPersonElements in horizontal row below tree (centered)
  6. applyPersonHighlighters(paper, data.persons)
  7. Sibling/half-sibling brackets: horizontal bar + drops for pairs NOT already
     connected by a shared union T-bar; half-sibling = dashed
  8. Bond rendering: BondLink for each bond where BOTH endpoints are in graph
     (support panel persons added in step 5, so their bonds draw here)
  9. paper.freeze() → paper.unfreeze() → transformToFitContent(...)
```

### Peripheral placement (`placePeripheral`)
Tracks `rowRightEdge` map (y → rightmost x at that row). Scans ALL elements at the target y to find true row extents (catches persons inside multi-partner containers).
- `side = 'left'`: place before leftmost element at that y row
- `side = 'right'`: place after rightmost element

### Support network panel
Bond-only peripheral persons (not in any union, not in any family relation, but bonded to a structural person) are placed in a centered horizontal row below the family tree, at `treeBottom + levelGap * 1.5`. Bond lines connect them to their target persons in the tree (long purple dashed lines, labeled with bond type).

---

## Highlighters (`src/highlighters.ts`)

`applyPersonHighlighters(paper, persons)` — called after layout.

- `DeceasedHighlighter` — SVG `<path>` drawing a small X in the **bottom-right corner** of the box (13×13px, margin 5px from corner). Subtle; doesn't obscure the name.
- `IndexPersonHighlighter` — SVG `<rect>` drawn 5px outside the box boundary (double border effect)

---

## Editor (`src/editor.ts`)

Left panel, four accordion sections: People / Relationships / Family Relations / Connections.

**State**: module-level `_data`, `_onChange`, `_openPersonId`, `_openUnionId`, `_openFamilyRelationId`, `_openBondId`. Only one form open at a time.

### People section
- Primary subject sorted first, shown with ★, no delete button
- Colored badge (sex color), strikethrough if deceased
- Form: name input, gender toggle buttons (M/F/O/?), age input, deceased checkbox

### Relationships (Unions) section
- Badge colored by quality (green/yellow/red/neutral)
- Status suffix shown in label if not active
- Form: partner 1 + 2 selects, type dropdown, status dropdown, quality stoplight buttons, children multi-select

### Family Relations section
- Slate badge, reads "[Person] is [Type] of [Person]"
- Form phrasing: **Person** / **is a…** / **of…** — type describes the subject, not the direction
- Types: parent, child, sibling, **half-sibling**, aunt, uncle, niece, nephew
- `'parent'` / `'child'`: feed into layout hierarchy (dagre edges)
- `'sibling'` / `'half-sibling'`: y-snap in Step 3.5, bracket rendered in main.ts
- `'aunt'` / `'uncle'` / `'niece'` / `'nephew'`: y-snap + `FamilyRelationLink` overlay

### Connections (Bonds) section
- Purple badge, `[From] → [To] (Label)` display
- Form: from/to selects, type dropdown, quality stoplight, custom label (type=other)
- Bond quality expressed via line **opacity** (green=1.0, yellow=0.7, red=0.5, none=0.85) — color stays purple

---

## Storage (`src/storage.ts`)

- `saveFile(data)` — serializes `FamilyData` to JSON blob, triggers browser download
- `loadFile()` — opens file picker via hidden `<input type="file">`, returns `Promise<FamilyData>`
- `exportPng(paper, filename)` — `paper.toDataURL()` → PNG download (padding 40, computed styles)

---

## UI Structure (`index.html` / `styles.css`)

```
#app
├── #toolbar       ← title input, New/Sample/Load/Save/Export PNG buttons + add-person/union/etc.
└── #main
    ├── #editor-panel (aside, 260px fixed)
    │   ├── #people-section
    │   ├── #unions-section
    │   ├── #family-relations-section
    │   └── #bonds-section
    └── #diagram-panel (flex:1)
        ├── #paper-container   ← JointJS paper mounts here
        └── #diagram-empty     ← setup screen OR empty state message
```

### Setup screen
On `New` or first load, `#diagram-empty` is replaced with `#setup-box` — centered card prompting for primary subject name and sex before editor becomes active.

---

## Sample Data (`src/families/example.json`)

4-generation family demonstrating all features:

- **14 people**: Alex (index, 38M), Richard (65M), Carol (62F), Susan (55F), Megan (41F), Tyler (22M), Jordan (35F), Leo (10M), Nina (7F), George (92M, deceased), Martha (88F, deceased), Don (44M), Aunt Lisa (59F), Dr. Park (46F)
- **5 unions**: George+Martha→Richard (married); Richard+Carol→Alex,Megan (married, divorced, red); Richard+Susan→Tyler (married, active, green); Alex+Jordan→Leo,Nina (married, active, green); Megan+Don (cohabiting, yellow)
- **3 family relations**: Tyler half-sibling of Alex; Tyler half-sibling of Megan; Aunt Lisa sibling of Richard
- **1 bond**: Dr. Park counselor of Alex (green)
- Dr. Park is bond-only peripheral → rendered in support network panel below tree

---

## Key Design Decisions

1. **All boxes are rectangles** — clinical standard; gender conveyed by color only
2. **Age inline with name** — format `"Name, age"` in single text element
3. **Union-centric model** — no `mother`/`father` on Person; couples explicit via Union
4. **Two relationship layers** — Family Relations (structural/layout) vs. Bonds (non-structural overlays)
5. **Family relation form phrasing** — "[Person] is a [type] of [Person]" so the type describes the subject; avoids confusing from/to+Child pattern
6. **Parent/child family relations → layout edges** — `getParentChildLinks()` merges union children + explicit family relation parents; `fromFamilyRelation: true` flag skips fan routing
7. **Sibling alignment is post-layout** — y-snap in Step 3.5, not a dagre edge (which would create hierarchical dependency)
8. **Half-sibling = explicit FamilyRelationType** — same y-snap as sibling; bracket drawn as dashed lines in main.ts; half-sibling brackets NOT drawn for persons already connected via a shared T-bar
9. **Active-side children right of former-side children** — Step 3.6 enforces this for multi-partner hubs; corrects dagre's crossing minimization which can place them wrong
10. **Multi-partner hub container** — timeline container `[former…, hub, active…]` keeps all of a person's relationships in one dagre node, preventing mate lines from crossing
11. **Bond-only peripherals → support network panel** — rendered below the tree, centered, with bond lines connecting to structural persons; not placed inline in tree (avoids long messy bonds crossing the tree)
12. **Bond quality = opacity, not color** — purple identity is preserved; green=1.0, yellow=0.7, red=0.5, none=0.85
13. **Deceased indicator = small corner X** — 13×13px in bottom-right corner; subtle, doesn't obscure name
14. **Primary subject required first** — setup screen enforces this; primary subject cannot be deleted
15. **Mate line label offset = -29** — places label at `midY - 6` (just above box top at `midY`), avoiding clipping through person boxes

---

## Known Limitations / Future Work

- **Peripheral uncle/aunt placement** uses parent-of-reference heuristic; may mis-place if reference person has multiple parents
- **T-bar bar extension** doesn't extend past midX toward the couple if all children are on one side — could clip for lopsided families
- **No undo/redo**
- **Click-to-edit on canvas** — currently form-based only; no drag/reorder
- **GitHub Pages deployment** — not yet configured
- **Print / PDF export** — PNG only currently
- **Color theme customization** — hardcoded clinical palette
- **Enmeshed/conflicted line styles** — not implemented (clinical genogram extension)
