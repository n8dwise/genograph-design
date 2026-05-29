# JointJS: Genogram (TypeScript)

A genogram is an extended family tree diagram used in medicine, psychology, and social work. This demo uses JointJS with the `@joint/layout-directed-graph` package to automatically lay out multi-generational family data with standardized symbols for gender, deceased status, adoption, and twin relationships.

<a href="https://stackblitz.com/github/clientio/joint-demos/tree/main/genogram/ts" target="_blank">
  <img
    alt="Open in StackBlitz"
    src="https://developer.stackblitz.com/img/open_in_stackblitz.svg"
  />
</a>

This demo is also available online at [jointjs.com](https://jointjs.com/demos/genogram).

## How to download this demo

You can download this demo using our [`@joint/cli` tool](https://www.npmjs.com/package/@joint/cli):

```bash
npx @joint/cli download genogram/ts
```

Alternatively, you can get the [copy of the repository](https://github.com/clientIO/joint-demos/archive/refs/heads/main.zip) from GitHub as usual.

## Running the application

Install the dependencies by running:

```bash
npm install
```

And then start the application with:

```bash
npm run dev
```

Open the URL shown in the terminal (default `http://localhost:5173`). Use the dropdown to switch between datasets.

## Project Structure

```
src/
  main.ts                  Entry point — paper setup, dataset loading, rendering
  shapes.ts                Element and link shape definitions (MalePerson, FemalePerson, etc.)
  highlighters.ts          Custom dia.HighlighterView classes (deceased cross, adopted brackets)
  layout/
    index.ts               Genogram layout algorithm (dagre + couple containers)
    minimize-crossings.ts  5-phase crossing minimization for dagre's customOrder
  utils.ts                 Element creation, lineage highlighting, family tree graph
  data.ts                  Data types and parsing (PersonNode, parent-child/mate links)
  theme.ts                 Centralized sizes, colors, z-index defaults, link style overrides
  styles.css               Paper and hover styling
  families/                Dataset JSON files
    thompson.json          Thompson family (fictional, multi-generational)
    british-royals.json    British Royal Family (George V to present)
    relationship-chart.json  Labeled relationship roles (Father, Cousin, etc.)
    benchmark.json         Large dataset (~1000 persons, 7 generations)
scripts/
  test-layout.cts    Node.js layout test (no browser needed)
```

For a detailed walkthrough of the layout algorithm, couple containers, crossing minimization, link routing styles, and theme architecture, see [TUTORIAL.md](TUTORIAL.md).

## Data Format

Each dataset is a flat JSON array of person objects:

```json
{
  "id": 1,
  "name": "Jane Doe",
  "sex": "F",
  "mother": 2,
  "father": 3,
  "dob": "1990-01-15",
  "dod": "2020-06-01",
  "adopted": true,
  "multiple": 1,
  "identical": 4
}
```

| Field      | Type      | Description                                          |
|------------|-----------|------------------------------------------------------|
| `id`       | `number`  | Unique identifier                                    |
| `name`     | `string`  | Display name                                         |
| `sex`      | `string`  | `"M"`, `"F"`, or `"?"`                               |
| `mother`   | `number?` | ID of the mother                                     |
| `father`   | `number?` | ID of the father                                     |
| `dob`      | `string?` | Date of birth (`YYYY-MM-DD`)                         |
| `dod`      | `string?` | Date of death (`YYYY-MM-DD` or `"?"` if unknown)     |
| `adopted`  | `boolean?`| Whether the person is adopted                        |
| `multiple` | `number?` | Multiple-birth group ID (shared by siblings)         |
| `identical`| `number?` | ID of the identical twin sibling                     |

Couple and parent-child relationships are derived automatically from `mother`/`father` references.

## Layout Test

A Node.js script reproduces the full layout pipeline without a browser, useful for verifying crossing-free layouts:

```bash
npm run test-layout
npm run test-layout -- --data=thompson.json
```

## Built With

- [@joint/core](https://www.jointjs.com) — Diagramming library
- [@joint/layout-directed-graph](https://www.jointjs.com) — Dagre-based automatic layout
- [Vite](https://vitejs.dev) — Dev server and bundler
- [TypeScript](https://www.typescriptlang.org)
