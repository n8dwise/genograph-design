# Genograph Code Smell Remediation Plan

## Bugs / Silent Defects

### 1. `.dob` reference in `minimize-crossings.ts`
**Files:** `src/layout/minimize-crossings.ts:139, 388`
**Problem:** `personA.dob` and `personB.dob` are used for barycenter tie-breaking, but `LayoutPersonNode` has no `dob` field. Both always evaluate to `undefined`, so the birth-date tie-breaker is silently non-functional. TypeScript doesn't catch it because the accesses are guarded with `|| ''`.
**Fix:** Either add `dob?: string` to `LayoutPersonNode` and wire it through `toLayoutPersonNodes`, or remove the dead comparator and replace with a stable fallback (e.g., numeric `id` order).

---

### 2. `formerCoupleInfos` array is always empty
**Files:** `src/layout/index.ts:63, 785–786`
**Problem:** `formerCoupleInfos` is declared and typed, but `.push()` is never called on it. The block at line 785 that draws "truly-former couple mate links" always produces an empty array and never executes. The `eslint-disable-next-line` suppressing the unused `FormerCoupleInfo` interface is a tell that this was left incomplete.
**Fix:** Determine intent — either populate the array (for non-hub divorced pairs that fall through the multi-partner logic) or remove the array, interface, and the dead `formerMateLinks_` block entirely.

---

## Dead Code

### 3. `buildFamilyTree` is exported but has no callers
**Files:** `src/utils.ts:25–39`
**Problem:** Exported function that creates an unstyled `dia.Graph` using bare `dia.Element`/`dia.Link` (not custom shapes). No file in the project imports or calls it.
**Fix:** Delete the function.

---

### 4. `FamilyRelationLink` shape is defined but never instantiated
**Files:** `src/shapes.ts`, `src/main.ts:19`
**Problem:** `FamilyRelationLink` is defined, exported, and registered in `cellNamespace`, but no code ever calls `new FamilyRelationLink(...)`. All family-relation lines use `ParentChildLink` instead.
**Fix:** Remove the class from `shapes.ts`, remove it from the `cellNamespace` import and registration in `main.ts`, and remove it from the `main.ts` import line.

---

## Code Smells

### 5. `-(y+1)` map key trick in peripheral placement
**Files:** `src/main.ts:101–105`
**Problem:** `rowRightEdge` uses `y` as the key for right-side tracking and `-(y+1)` as the key for left-side tracking to avoid a collision at `y=0`. Clever but opaque.
**Fix:** Split into two maps — `rowRightEdge` and `rowLeftEdge` — with matching semantics.

---

### 6. Quality button block copy-pasted three times
**Files:** `src/editor.ts:296–317, 485–506, 641–662`
**Problem:** The logic to build quality radio buttons is identical in `buildUnionForm`, `buildFamilyRelationForm`, and `buildBondForm`. Any change to quality button behavior must be applied in three places.
**Fix:** Extract to a shared helper:
```ts
function buildQualityOptions(
    current: RelationshipQuality | null,
    onChange: (q: RelationshipQuality | null) => void,
): HTMLElement
```

---

### 7. `handleDataChange` redundantly assigns `currentData`
**Files:** `src/main.ts:257–260`
**Problem:**
```ts
function handleDataChange(data: FamilyData) {
    currentData = data;   // redundant — render() does this on line 45
    render(data);
}
```
**Fix:** Remove the `currentData = data` line from `handleDataChange`.

---

### 8. `loadFile` clobbers `onchange` on rapid double-click
**Files:** `src/storage.ts:17–37`
**Problem:** Each call to `loadFile()` reassigns `input.onchange`. If the user clicks Load twice before the first file dialog resolves, the first promise is silently abandoned — it will never resolve or reject.
**Fix:** Create a fresh `<input type="file">` element per call (append, click, then remove it), or at minimum clear any existing handler and add a guard to reject if called while already pending.

---

### 9. ID generation relies on regex digit-stripping
**Files:** `src/data.ts:171–189` (`nextFamilyRelationId`, `nextBondId`, `nextUnionId`)
**Problem:** These functions strip non-digit characters from IDs then find the max. If the ID format ever drifts (e.g., `fr-1` vs `fr1`), the function silently returns a wrong value.
**Fix:** Low risk given the ID format is controlled internally, but consider storing a simple counter on `FamilyData` (e.g., `meta._nextId`) or using a UUID-based approach to make generation format-independent.

---

### 10. `layoutGenogram` is ~750 lines
**Files:** `src/layout/index.ts:36–787`
**Problem:** The function is readable thanks to step-header comments, but Steps 3–3.8 are independently testable algorithms. As complexity grows (e.g., polyamorous relationship support), this function will become harder to navigate and impossible to unit-test in isolation.
**Fix:** Extract each numbered step into a named helper function that accepts the minimum state it needs. Start with the most self-contained ones (3.7 age sort, 3.8 overlap prevention).

---

## Priority Order

| # | Priority | Item |
|---|---|---|
| 1 | **Fix** | `.dob` reference — silently broken tie-breaker |
| 2 | **Fix** | `formerCoupleInfos` never populated — dead block, unclear intent |
| 3 | **Clean** | `buildFamilyTree` dead code |
| 4 | **Clean** | `FamilyRelationLink` dead code |
| 5 | **Clean** | Quality button duplication (3× copy-paste) |
| 6 | **Minor** | `-(y+1)` map key trick |
| 7 | **Minor** | `handleDataChange` redundant assignment |
| 8 | **Minor** | `loadFile` onchange clobbering |
| 9 | **Minor** | ID generation fragility |
| 10 | **Future** | `layoutGenogram` refactor into step helpers |
