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
npm run dev       # start dev server (Vite)
npm run build     # tsc + vite build → dist/
npm run preview   # preview production build
```

---

## File Map

```
genograph/
├── index.html               # App shell — toolbar + split-pane layout
├── package.json
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
│       ├── index.ts         # 6-step layout engine (5 original + sibling alignment)
│       └── minimize-crossings.ts  # Barycenter crossing minimization
└── src/families/
    └── example.json         # Sample data in current format
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
    deceased?: boolean;     // renders X highlighter over box
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

type FamilyRelationType = 'parent' | 'child' | 'sibling' | 'aunt' | 'uncle' | 'niece' | 'nephew';

interface FamilyRelation {
    id: string;             // "fr1", "fr2", ...
    from: number;           // the person described (e.g. "Allen is Parent of Nathan" → from=Allen)
    to: number;             // the reference person
    type: FamilyRelationType;
}

type BondType = 'guardian' | 'close-friend' | 'counselor' |
                'mentor' | 'caregiver' | 'sponsor' | 'important-adult' | 'other';

interface Bond {
    id: string;             // "b1", "b2", ...
    from: number;
    to: number;
    type: BondType;
    label?: string;         // custom label when type === 'other'
}

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
`getParentChildLinks(data)` now includes both union children AND family relations of type `'parent'`/`'child'`. Links from family relations carry `fromFamilyRelation: true` so the layout engine skips fan routing for them (they draw from the individual parent, not the couple midpoint).

`toLayoutPersonNodes()` converts `FamilyData` by inspecting unions — the female partner becomes mother, male becomes father (fallback: first partner = father).

---

## Shapes (`src/shapes.ts`)

All person shapes are **colored rectangles** (standard clinical style).

| Class | Fill | Stroke | Meaning |
|-------|------|--------|---------|
| `MalePerson` | `#dbeafe` | `#2563eb` | Male (blue) |
| `FemalePerson` | `#fce7f3` | `#db2777` | Female (rose) |
| `OtherPerson` | `#ede9fe` | `#7c3aed` | Other gender (purple) |
| `UnknownPerson` | `#e5e7eb` | `#6b7280` | Unknown (gray) |

Markup: `<rect @selector="body"/>` + `<text @selector="name"/>` + `<text @selector="age"/>` (age slot kept in markup but currently unused — age is appended to name text instead).

### Link classes
- `ParentChildLink` — slate gray (`#94a3b8`), no arrow, strokeWidth 1.5
- `MateLink` — color from quality stoplight, strokeDasharray for status (see Layout Step 5)
- `FamilyRelationLink` — slate gray (`#64748b`), smooth connector, no arrow, strokeWidth 1.5; used for sibling/aunt/uncle/niece/nephew overlays with labeled pill
- `BondLink` — purple (`#7c3aed`), dashed `6 3`, smooth connector, floating label

### JointJS namespace registration (in `main.ts`)
```typescript
const cellNamespace = {
    ...shapes,
    genogram: { MalePerson, FemalePerson, OtherPerson, UnknownPerson, ParentChildLink, MateLink, FamilyRelationLink, BondLink },
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

6-step pipeline called from `main.ts` as `layoutGenogram(...)`. Now accepts `familyRelations?: FamilyRelation[]`.

**Step 1 — Couple containers**: invisible rectangles sized to hold both partners side-by-side. Used as dagre nodes so partners stay together. Each mate pair that hasn't already been assigned a container gets one.

**Step 2 — Dagre layout**: `DirectedGraph.layout()` with `rankDir: 'TB'`, using `minimizeCrossings` as `customOrder` to reduce edge crossings. Parent-child links point from container (or solo person) to child. Each `LinkInfo` now carries `fromFamilyRelation: boolean`.

**Step 3 — Couple positioning**: After dagre runs, extract container position, place left/right partner elements relative to it. "Left" is whichever partner's parents are further left.

**Step 3.5 — Sibling alignment**: After couple positioning, for each `sibling` family relation, snap the subject's y-position to match their sibling's y-position. If the subject is coupled, their partner moves too.

**Step 4 — Link reconnection**: Reroute parent-child links from containers back to actual person elements. Fan routing (midpoint of couple → horizontal → down to child) applies only to union-derived links. Links with `fromFamilyRelation: true` skip fan routing and connect directly from the individual parent element. Containers are then removed from graph.

**Step 5 — Mate links**: Create colored `MateLink` elements between each couple:
- Stroke: `qualityStrokeColor(union.quality)` (stoplight or neutral gray)
- Dasharray: `'10 5'` if divorced, `'5 4'` if separated, `''` if active

**Known limitation**: If a person appears in more than one union, the second union's container is skipped (`coupledPersonIds` check). Remarriage visual support is deferred.

---

## Editor (`src/editor.ts`)

Left panel, four accordion sections: People / Relationships / Family Relations / Connections.

**State**: module-level `_data`, `_onChange`, `_openPersonId`, `_openUnionId`, `_openFamilyRelationId`, `_openBondId`. Only one form open at a time.

### People section
- Primary subject sorted first, shown with ★, no delete button
- Colored badge (sex color), strikethrough if deceased
- Form: name input, gender toggle buttons (M/F/O/?), age input, deceased checkbox
- Save triggers `_onChange(data)` → re-render diagram

### Relationships (Unions) section
- Badge colored by quality (green/yellow/red/neutral)
- Status suffix shown in label if not active
- Form: partner 1 + 2 selects, type dropdown, status dropdown, quality stoplight buttons (2-column grid), children multi-select (Ctrl/Cmd for multiple)
- `addUnion()` requires ≥ 2 people

### Family Relations section
- Slate badge, list reads "[Person] is [Type] of [Person]" (e.g. "Allen is Parent of Nathan")
- Form reads top-to-bottom: **Person** / **is a…** / **of…** — intentionally phrased so relation type describes the subject, not the direction
- Default on `+ Add`: subject = first non-primary person, reference = primary subject, type = Parent
- Types: parent, child, sibling, aunt, uncle, niece, nephew
- `'parent'` and `'child'` types feed into `getParentChildLinks()` → affect dagre layout hierarchy (parent above child)
- `'sibling'` is handled by Step 3.5 (y-position snap), rendered as labeled `FamilyRelationLink`
- `'aunt'`, `'uncle'`, `'niece'`, `'nephew'` render as labeled `FamilyRelationLink` overlays only (no layout effect)

### Connections (Bonds) section
- Purple badge, `[From] → [To] (Label)` display
- Form: from/to selects, type dropdown, custom label input (used when type=other)
- `addBond()` requires ≥ 2 people
- Bond type `'other'` uses the custom label in the diagram; all others use `BOND_LABELS` lookup
- Types: guardian, close-friend, counselor, mentor, caregiver, sponsor, important-adult, other
  (`'parent'` was removed from BondType — it now lives in FamilyRelationType)

---

## Render Flow (`src/main.ts`)

```
showSetupScreen() on init
  → user enters primary subject name + sex
  → currentData.persons.push({ id:1, isIndexPerson:true, ... })
  → setEditorData(currentData)
  → render(currentData)

render(data):
  1. toLayoutPersonNodes(data) + getParentChildLinks(data) [includes family relation parent/child] + getMateLinks
  2. graph.resetCells([])
  3. layoutGenogram({ graph, elements, persons, parentChildLinks, mateLinks, unions, familyRelations, sizes, linkShapes })
  4. applyPersonHighlighters(paper, data.persons)
  5. For each family relation (type !== 'parent' && !== 'child'): new FamilyRelationLink + labeled pill → graph.addCells
  6. For each bond: new BondLink + labeled pill → graph.addCells
  7. paper.freeze() → paper.unfreeze()
  8. paper.transformToFitContent({ padding:60, verticalAlign:'top', horizontalAlign:'middle' })
```

Family relation labels: slate text (`#334155`) on light gray pill (`#f1f5f9` fill, `#94a3b8` stroke), at `distance: 0.5`.
Bond labels: purple text (`#5b21b6`) on lavender pill (`#f5f3ff` fill, `#c4b5fd` stroke), at `distance: 0.5`.

---

## Highlighters (`src/highlighters.ts`)

`applyPersonHighlighters(paper, persons)` — called after layout.

- `DeceasedHighlighter` — SVG `<path>` drawing an X from corner to corner (inset by `sizes.deceasedCrossInset = 5px`)
- `IndexPersonHighlighter` — SVG `<rect>` drawn 5px outside the box boundary (double border effect)

---

## Storage (`src/storage.ts`)

- `saveFile(data)` — serializes `FamilyData` to JSON blob, triggers browser download
- `loadFile()` — opens file picker via hidden `<input type="file">`, returns `Promise<FamilyData>`
- `exportPng(paper, filename)` — `paper.toDataURL()` → PNG download (padding 40, computed styles)

---

## UI Structure (`index.html` / `styles.css`)

```
#app
├── #toolbar       ← title input, New/Load/Save/Export PNG buttons
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
On `New` or first load, `#diagram-empty` is replaced with `#setup-box` — a centered card prompting for primary subject name and sex before the editor becomes active.

---

## Key Design Decisions

1. **All boxes are rectangles** — clinical standard; gender conveyed by color only
2. **Age inline with name** — format `"Name, age"` in single text element (not a separate row)
3. **Union-centric model** — no `mother`/`father` fields on Person; couple relationships explicit via Union
4. **Two relationship layers** — Family Relations (structural: affect layout) vs. Bonds (non-structural: overlays)
5. **Family relation form phrasing** — "[Person] is a [type] of [Person]" so the type describes the subject, not the direction; avoids the confusing "from/to + Child" pattern
6. **Family relation parent/child → layout edges** — `getParentChildLinks()` merges union children and explicit family relation parents into one array; `fromFamilyRelation: true` flag skips fan routing so the line comes from the individual, not the couple midpoint
7. **Sibling alignment is post-layout** — done in Step 3.5 by snapping y-positions after dagre; not a dagre edge (which would create a hierarchical dependency)
8. **Primary subject required first** — setup screen enforces this; primary subject cannot be deleted
9. **Mate line quality** — stoplight colors (green/yellow/red/neutral) + dashed if separated, long-dashed if divorced
10. **No UnionBox element** — was built in early version, removed; quality is on the line, not a box

---

## Phase 2 / Future Work (not started)

- Remarriage / multiple unions per person (layout currently skips second union)
- Sibling layout: aunt/uncle/niece/nephew position inference from tree structure
- Enmeshed and conflicted relationship line styles (clinical)
- Additional clinical markers
- GitHub Pages deployment
- Print / PDF export
- Color theme customization
- Click-to-build visual editor (currently form-based only)
