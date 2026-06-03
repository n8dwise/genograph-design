# Genograph — Fixes Plan

Issues collected from review. Not yet implemented.

---

## Fix 1 — Multi-partner hub T-bars visually bleed into each other

**What's wrong:** When a person has children from multiple unions (e.g. Richard → Alex & Megan from Carol; Tyler from Susan), the two T-bars land at the same `barY` level and their horizontal bar segments are drawn so close together that they look like one continuous grey bar connecting all three children. This implies all three share the same union, which is clinically wrong.

**Desired behavior:**
- Richard+Carol T-bar drops to Alex and Megan (full siblings — correct, no change needed)
- Richard+Susan T-bar drops to Tyler separately, with a visible gap between the two bars
- **No additional connecting line between the two groups** — the half-sibling relationship is already implied by Richard appearing in both T-bars; an explicit bracket is redundant and misleading
- Rule generalises: any extra child of Richard+Carol would simply hang from the same T-bar as Alex and Megan; no sibling bracket needed

**Root cause:** Both T-bars share the same `barY` (same parent generation Y). The bar for Richard+Carol extends from `min(midX_RC, leftmostChild)` to `max(midX_RC, rightmostChild)`. If Megan+Don (a former-union couple) get placed by dagre to the right of midX_RC, that bar extends rightward and nearly touches the Richard+Susan bar, making them look joined.

**Fix (two parts):**
1. In `layout/index.ts` Step 3.6 — also constrain **former-side** coupled children (e.g. Megan+Don) to stay to the **left** of `midX_RC`, not just push active-side children right. This gives the two T-bars room to breathe.
2. Suppress half-sibling bracket drawing entirely — the T-bars already tell the story. (Currently the bracket code only fires for `type === 'sibling'`, so half-sibling brackets aren't drawn anyway — confirm this is intentional and document it clearly.)

**Files to touch:** `src/layout/index.ts` — Step 3.6

---

## Fix 2 — Downloadable JSON schema guide

**What's wanted:** A button on the page (toolbar) that downloads a plain-text / Markdown reference file explaining how to hand-build a valid genograph JSON file. Intended workflow: therapist downloads the guide, pastes it into an LLM conversation, has the LLM generate the JSON for a real family, then loads it into the app via the existing "Load" button.

**Document should cover:**
- Top-level structure: `{ meta, persons, unions, familyRelations, bonds }`
- `Person`: `id` (integer, primary subject must be `1`), `name`, `sex` (`M`/`F`/`O`/`?`), `age` (optional number), `deceased` (optional boolean), `isIndexPerson` (true only on id 1)
- `Union`: `id` (`"u1"`, `"u2"`…), `partners` [id, id], `type` (`married`/`cohabiting`/`affair`/`unknown`), `status` (`active`/`separated`/`divorced`/`widowed`/`deceased`), `quality` (`green`/`yellow`/`red`), `children` (array of person IDs)
- `FamilyRelation`: `id` (`"fr1"`…), `from`, `to`, `type` (`parent`/`child`/`sibling`/`half-sibling`/`aunt`/`uncle`/`niece`/`nephew`), `quality` (optional)
- `Bond`: `id` (`"b1"`…), `from`, `to`, `type` (`guardian`/`close-friend`/`counselor`/`mentor`/`caregiver`/`sponsor`/`important-adult`/`other`), `label` (custom string when type is `other`), `quality` (optional)
- ID rules: person IDs are plain integers (1, 2, 3…); all other IDs are prefixed strings (u1, fr1, b1); no two records share an ID within their own array
- A short complete example covering multiple generations, a divorce/remarriage, a half-sibling, and a bond
- A brief LLM prompt hint ("tell the LLM: generate a genograph JSON for [description], following this schema")

**Implementation:**
- Write the guide as a static Markdown file bundled with the app (e.g. `src/families/json-guide.md`)
- Import it in `main.ts` via Vite's `?raw` import (`import guideContent from './families/json-guide.md?raw'`)
- Add a "Get JSON Guide" button to the toolbar; on click, trigger a browser download of the `.md` file (same blob-download pattern used by `saveFile`)

**Files to touch:** `src/families/json-guide.md` (new), `src/main.ts` (button handler), `index.html` (button element), `src/styles.css` (minor toolbar tweak if needed)

---

## Fix 3 — Export PNG does nothing

**What's wrong:** Clicking "Export PNG" produces no download and no visible error.

**Root cause:** `paper.toDataURL()` API changed between JointJS v3 and v4. The current code uses the v3 callback style (`paper.toDataURL(callback, options)`); in JointJS v4.x the method returns a `Promise<string>` instead — the callback is never invoked so the download never triggers. This is also the source of the pre-existing tsc error noted in `storage.ts`.

**Fix:** Convert `exportPng` to async, await the Promise, then trigger the download:
```typescript
export async function exportPng(paper: dia.Paper, filename = 'genograph') {
    const dataURL = await paper.toDataURL({ padding: 40, useComputedStyles: true });
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `${filename}.png`;
    a.click();
}
```
Update the call site in `main.ts` to handle the returned Promise (add `.catch` or make the handler async).

**Files to touch:** `src/storage.ts`, `src/main.ts` (btn-export-png handler)

---

## Fix 4 & 5 — Person indicators missing from legend

**What's wrong:** Two visual indicators appear on person boxes but are not explained in the legend:
- **Primary subject** — double black border (via `IndexPersonHighlighter`)
- **Deceased** — small X in the bottom-right corner (via `DeceasedHighlighter`)

**Fix:** Add an "Indicators" section to the legend with two rows:
- A box-with-double-border swatch + "Primary Subject" label
- A box-with-X swatch + "Deceased" label

**Files to touch:** `index.html` (legend markup), `src/styles.css` (legend swatch styles for double-border and X indicator)

---

## Fix 6 — Mate line labels are redundantly verbose

**What's wrong:** The mate line label combines type + status literally, e.g. "Married, Divorced". But "divorced" already implies the couple was married — the type prefix adds noise without adding meaning when the status speaks for itself.

**Desired label logic:**
- Status is the ended state → show status only: "Divorced", "Separated", "Widowed", "Both Deceased"
- Exception: if type is `cohabiting` or `affair` and status is `separated`, prefix matters clinically → show "Cohabiting, Separated" / "Affair, Separated"
- Status is active → show type only: "Married", "Cohabiting", "Affair"
- Type is `unknown` or undefined → show nothing (existing behaviour)

**Also consider in the editor form:** when status is set to `divorced`, auto-default type to `married` (since divorce is a legal process implying prior marriage). Makes the form faster to fill in for the common case.

**Files to touch:** `src/layout/index.ts` (`makeMateLink` label logic), `src/editor.ts` (optional: auto-default type when status = divorced/widowed)

---

## Fix 7 — Small UI polish items

- **Rename "Save" button → "Download JSON"** (`index.html`)
- **Rename "↺ Re-layout" button → "↺ Reset Layout"** (`index.html`)
- **Make the title input more discoverable** — the "Family name…" field already drives both the JSON filename and PNG export filename, but it blends into the dark toolbar; consider a visible label like "Title:" beside it (`index.html`, `src/styles.css`)

---

## Future Feature — Three-way (polyamorous) relationships

**What's wanted:** Support for unions with three or more partners (e.g. a polyamorous triad where A-B, B-C, and A-C are all in relationship).

**Current limitation:** The data model enforces `partners: [number, number]` (exactly two people), and the entire layout engine — container sizing, mate lines, T-bar midpoint calculations, multi-partner hub logic — assumes pairs. The existing multi-partner hub handles one person with multiple *sequential or concurrent* two-person unions, which is not the same thing.

**What would be needed:**
- Change `partners: [number, number]` → `partners: number[]` in the `Union` interface and update all downstream TypeScript
- Decide on a visual representation (triangle of mate lines? a group box enclosing all partners?)
- Update T-bar midpoint to use centroid of all partners rather than midpoint of two
- Update container sizing and mate-link drawing in `layout/index.ts`
- Update the union form in `editor.ts` to allow adding a third partner

**Note:** No established clinical genogram standard exists for three-way relationships — visual convention would need to be decided before implementing.
