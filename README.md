All content in this repository, including the software and the haiku, is copyright (c) 2024 Ben Copeland. All rights reserved.

# nephesh

A personal haiku journal, built with [Astro](https://astro.build).

## Local development

```sh
pnpm install
pnpm dev
```

Visit `localhost:4321`.

## Adding a haiku

Add a new file to `src/content/haiku/`, e.g. `src/content/haiku/my-new-haiku.md`:

```md
---
lines:
  - "first line"
  - "second line"
  - "third line"
order: 60
---
```

`order` should be one higher than the current highest `order` value in `src/content/haiku/` — the highest `order` is automatically featured on the homepage. Add `date: "YYYY-MM-DD"` if the composition date is known.

## Build

```sh
pnpm build
```

Outputs a static site to `dist/`.
