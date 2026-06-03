# Genograph — User Guide

Genograph is a browser-based clinical genogram tool. Everything runs locally in your browser — no data is ever uploaded or stored on any server.

---

## Getting Started

Use the toolbar buttons at the top to manage your files:

| Button | What it does |
|---|---|
| **New Genograph** | Clears everything and starts a blank diagram |
| **Sample Genograph** | Loads a built-in 4-generation example to explore |
| **Load JSON** | Opens a previously saved `.json` file |
| **JSON Guide** | Downloads a schema reference for building genograms with an AI assistant |
| **Download JSON** | Saves your current work as a `.json` file |
| **Download PNG** | Exports the diagram as a high-resolution image |
| **↺ Reset Layout** | Resets all positions and re-runs the automatic layout |

> **Tip:** Save your work often using **Download JSON**. Your data is not stored anywhere between sessions — if you close the tab without saving, changes will be lost.

---

## The Left Panel

The left panel has four sections. Click any section header to expand it; the others collapse automatically.

### People
Everyone in the family system — family members, the client, and other key figures.

- Click **+ Add** to add a new person
- Fill in their name, sex, age, and any notes
- Mark them as **deceased** if applicable
- The **primary subject** (the client) is marked with ★ and cannot be deleted
- Click any name in the list to open their edit form; click again to close

### Relationships
Romantic or co-parenting pairs. Children are assigned here, not under People.

- Click **+ Add** to create a relationship between two people
- Set the **type** (Married, Cohabiting, Affair, or custom)
- Set the **status** (Active, Divorced, Separated, Widowed)
- Set **relationship quality**: 🟢 Good / 🟡 Strained / 🔴 Conflicted
- Use the **Children** list to assign children to this couple

### Other Family Connections
For relatives whose shared parents aren't in the diagram — aunts, uncles, or off-diagram siblings.

- Use this section for connections like "Lisa is the aunt of Alex"
- For siblings who share parents already in the diagram, add them as children of the relevant Relationship instead

### Connections
Non-family support bonds — guardians, mentors, sponsors, close friends, counselors.

- Click **+ Add** to create a support bond between two people
- Set the bond type and an optional custom label
- Set relationship quality and it will affect the line's opacity

---

## The Diagram

The diagram is generated automatically from the data you enter.

- **Drag** any person box to reposition it — positions are saved when you move elements
- **Click** any person box to open their edit form in the left panel
- **Click** any relationship line to open that relationship's edit form
- **↺ Reset Layout** clears all saved positions and re-runs the automatic layout

### Reading the Diagram

**Gender** is shown by box color:
- Blue = Male
- Pink = Female
- Purple = Non-Binary
- Gray = Unknown

**Relationship lines** between partners:
- Solid line = Active relationship
- Dashed line = Ended (divorced, separated, widowed)
- Line color = Relationship quality (gray = none, green = good, yellow = strained, red = conflicted)

**Support bond lines** (dash-dot purple) connect non-family figures.

**Indicators:**
- Double border = Primary subject (the client)
- Small ✕ in corner = Deceased

---

## Tips

- **Multi-generational families:** Add the oldest generation first, then work down. This helps the auto-layout produce a cleaner result.
- **Sharing with a colleague:** Use **Download JSON** and send the file. They can open it with **Load JSON** on their own copy of Genograph.
- **Printing:** Use **Download PNG** for a high-resolution image suitable for printing or including in a report.
- **AI-assisted entry:** Use **JSON Guide** to download the data schema, then ask an AI assistant (like ChatGPT or Claude) to help you build a complex family JSON from notes.
- **Privacy:** No data ever leaves your device. The tool works fully offline once the page has loaded.
