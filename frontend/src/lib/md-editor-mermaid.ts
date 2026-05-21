/**
 * Share one md-editor-v3 + mermaid setup for MdEditor (edit) and MdPreview (read).
 */
let configured = false

export async function configureMdEditorMermaid(): Promise<void> {
  if (configured) return

  const [{ config }, mermaidMod] = await Promise.all([
    import('md-editor-v3'),
    import('mermaid'),
  ])

  const mermaid = mermaidMod.default ?? mermaidMod
  config({
    editorExtensions: {
      mermaid: {
        instance: mermaid,
      },
    },
  })
  configured = true
}
