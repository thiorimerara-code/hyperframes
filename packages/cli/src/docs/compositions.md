# Compositions

A composition is an HTML document that defines a video timeline.

## Structure

Every composition needs a root element with `data-composition-id`:

```html
<div id="root" data-composition-id="root" data-width="1920" data-height="1080">
  <!-- Elements go here -->
</div>
```

## Nested Compositions

Embed one composition inside another:

```html
<div data-composition-src="./intro.html" data-start="0" data-duration="5"></div>
```

## Listing Compositions

Use `npx hyperframes compositions` to see all compositions in a project.

## Variables

Two attributes work together:

- **`data-composition-variables`** on the `<html>` root *declares* the variables (id, type, label, default).
- **`data-variable-values`** on a sub-comp host element *overrides* values for that one instance.

Inside any composition script, `window.__hyperframes.getVariables()` returns the merged result of declarations + overrides. CLI `npx hyperframes render --variables '{...}'` provides a top-level override that layers the same way.

```html
<!-- compositions/card.html -->
<html data-composition-variables='[
  {"id":"title","type":"string","label":"Title","default":"Hello"},
  {"id":"color","type":"color","label":"Color","default":"#111827"}
]'>
  <body>
    <div data-composition-id="card" data-width="1920" data-height="1080">
      <h1 class="title"></h1>
      <script>
        const { title, color } = window.__hyperframes.getVariables();
        document.querySelector(".title").textContent = title;
        document.querySelector(".title").style.color = color;
      </script>
    </div>
  </body>
</html>
```

```html
<!-- index.html — embed twice with different per-instance values -->
<div data-composition-id="card-pro" data-composition-src="compositions/card.html"
     data-variable-values='{"title":"Pro","color":"#ff4d4f"}'></div>
<div data-composition-id="card-enterprise" data-composition-src="compositions/card.html"
     data-variable-values='{"title":"Enterprise","color":"#22c55e"}'></div>
```

The runtime layers `data-variable-values` over the sub-comp's declared defaults on a per-instance basis. The same `getVariables()` call works at the top level too — the CLI flag `--variables` provides the override, declared `default`s fall through for missing keys.
