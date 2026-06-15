# Write output format

Step 1 returns a Markdown document for the new post:

```markdown
# A post title

Markdown post body, optionally ending with a short footer of 2-3 direct web URLs.
```

Rules:

- The first non-empty line must be a single level-1 heading (`# Title`), 1-140 characters.
- No YAML frontmatter.
- No code fences around the document.
- 2-3 direct web URLs may appear in a short footer as references.
- No citations or research-note sections in the body.

The app validates this output and passes it to step 2 as `input/NEW_POST.md`.
