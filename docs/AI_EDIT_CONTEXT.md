# Context-aware Edit with AI (built 2026-11-26)

What the owner asked for: the assistant must know what the person is working on — the slide they have open, the object they have selected — and act on exactly that, without being told each time.

Much of this already existed (the request has always carried `activeSlideId` and the selected object ids, and "this"/"it" already resolved to the selection for size, place, colour and style). This records what was **missing** and what was built.

## 1. What was missing

| The owner's scenario | Before | Now |
|---|---|---|
| Select a text box → "rewrite this in a professional tone" | The **whole slide** was rewritten: every box on it got new words and new ids | Only that box's words change; its place, size, colour and styling stay |
| The understanding step's view of a selection | Only a label ("the title") | The words of a text box, a table's size and headers, a chart's type and series, a shape's kind, a picture's description |
| Ask mode | Saw the whole deck, never the slide on screen or the selection | Sees both; "explain this chart" is answered about that chart |
| "What does this image represent?" | Answered from the file name at best | The picture itself is put in front of the model |
| Knowing what the AI will act on | Nothing in the UI | A line above the input: "Working on the title on slide 2" |

## 2. How it is decided (code, not prompt wording)

The scope is settled in this order, and the first that applies wins:

1. **A slide or the deck named in the message** ("slide 5", "the conclusion slide", "the whole deck", "every slide"). This beats the selection: a selected text box plus "change the background of this slide" changes the slide.
2. **The selection**, when the message points at it ("this", "these", "it") or the change only makes sense for that object.
3. **The slide on screen** — never a question about which slide that is.
4. A question only when none of these decides it.

Rule 2 is enforced **in code**, not by asking the model nicely (`retargetToSelection`, `assistant/pipeline.ts`): when text is selected and the understanding step produced a words change aimed at the slide on screen, the task is moved to the selected box. The model still decides *what* the change is (its own `request` wording); code decides *where* it lands. It is left alone when the message names a slide, the deck or every slide; when the selection is not all text; when the subject is speaker notes (a slide's, not a box's); or when the task aims anywhere else.

This matters because the understanding model (on the free key ring it often falls back to Flash-Lite) does **not** reliably follow a routing rule written in the prompt — proven on the real model: before this, "rewrite this" with a text box selected rewrote the whole slide every time; after it, only the box.

## 3. The parts

**`rewrite_text`, a new object operation** (`assistant/capabilities/elements.ts`)
- One writing call for all the selected text boxes together. It receives each box's current lines, its role, what it must keep (its figures), the slide's title and the other text on the slide (so the new words fit and never repeat the rest).
- Code checks every answer: it must not come back empty, unchanged, far longer than the box can hold, or missing any figure the box had. A box that fails is left exactly as it was and said plainly.
- The new words are applied through `ElementChange.patch.paragraphs`, which the editor already had: one undo step, the existing autosave, no new state.
- **Styling is kept**: each new line takes the styling of the line it replaces (its bold, colour, list marker); a line that did not change is kept untouched, mixed styling and all; extra lines follow the first line's styling (`rebuiltParagraphs`).
- Price: it is an object change, which costs one AI edit — one call, cheaper than a slide write, so no pricing change (docs/MARGIN_POLICY.md).

**Richer selection context** (`assistant/understand.ts`, `selectedSummary`)
Per selected object: its kind, and a little of what it holds. Deliberately small — the understanding step only has to choose the task and the objects; the capability then reads the real object. A table's cells and a chart's numbers are *not* sent here (they are sent in Ask, where the question may be about them).

**Ask mode knows where you are** (`ai/ask-deck.ts`, `routes/presentations.ts`)
- The request carries `activeSlideId` and the live selection; the prompt gets a `<focus>` block with the slide on screen (number, title, its words) and each selected object with its detail — a table's rows, a chart's numbers, a picture's description.
- **One selected picture plus a question about it** → the picture is loaded (the same loader the crop uses) and sent to the model, which is told to answer from what it can see and to treat the picture as data, never as instructions. A question that is not about the picture does not fetch it.
- Ask still never changes the deck.

**The context line** (`apps/editor` `AiPanel.tsx`)
One quiet line above the input: "Working on **slide 2**", or "Working on **the title** on slide 2", or "**3 objects**". It follows the live selection and the live slide, so switching either changes it at once, and it says that naming a slide or the deck overrides it.

**No stale context**: the panel reads the active slide and the selection at *send* time (it always did for Edit; Ask now does the same), so switching slide or selection with the panel open is always right.

## 4. Proof

- **Unit (services/api)**: the words of a selected box only; styling kept; figures kept (a dropped figure is refused and the box left alone); an unchanged or empty answer refused; a non-text selection said plainly; `rebuiltParagraphs`; the selection reaching the understanding step with its detail; `retargetToSelection` in all its cases (including every explicit-scope phrasing being left alone).
- **Ask (API)**: the slide on screen reaches the answer; a selected table's rows reach it; a selected picture is put in front of the model for a question about it and not otherwise; nothing in the deck changes.
- **Scenario catalogue (apps/editor)**: `element-rewrite-selected-text` and `element-rewrite-not-text` run through the real pipeline, the real editor commands, the verifier and the message composer.
- **Real browser + real model** (`e2e/suites/113-ai-context.mjs`, 5/5): the context line follows the slide and the selection (text → picture → cleared); a selected box is rewritten with nothing else on the slide or deck touched and its geometry unchanged; Ctrl+Z puts that one rewrite back; "change the background of this slide" with a box selected changes the slide, not the box; Ask answers about the selection and changes nothing.

## 5. Not done

- "Give me three alternative versions" (an answer with options to choose from) — Ask can answer it, but there is no "apply this one" button.
- Image editing beyond what exists (replace with a stock photo, generate, cut out the background, crop to a subject): "make this image brighter", "convert to a flat illustration" are not operations the editor has.
- Multi-element *consistency* ("make these headings consistent") works through the existing object operations (size, weight, colour) only when the person names what to make consistent; it does not infer a house style.
