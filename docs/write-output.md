# Write output format

Step 1 returns a Markdown document for the new post:

```markdown
# A post title

Markdown post body with no visible source list.
```

Rules:

- The first non-empty line must be a single level-1 heading (`# Title`), 1-140 characters.
- No YAML frontmatter.
- No code fences around the document.
- No visible URLs, source footers, or citation sections in the body.

The app validates this output and passes it to step 2 as `input/NEW_POST.md`.
