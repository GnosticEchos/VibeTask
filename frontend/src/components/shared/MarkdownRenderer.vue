<template>
  <div ref="contentRef" class="markdown-body"></div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import MarkdownIt from 'markdown-it'

let mermaid: any = null

async function ensureMermaid() {
  if (!mermaid) {
    try {
      const mod = await import('mermaid')
      mermaid = mod.default || mod
    } catch {
      // Mermaid unavailable, diagrams will be plain code blocks
    }
  }
  return mermaid
}

const props = defineProps<{
  content: string
}>()

const contentRef = ref<HTMLElement | null>(null)
let mermaidId = 0

function isDarkTheme(): boolean {
  const theme = document.documentElement.getAttribute('data-theme');
  return ['dark', 'dracula', 'black', 'night', 'abyss'].includes(theme || 'light');
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

async function renderMermaid(container: HTMLElement) {
  const elements = Array.from(container.querySelectorAll<HTMLElement>('.mermaid:not([data-processed])'))
  if (elements.length === 0) return

  const mm = await ensureMermaid()
  if (!mm) return

  try {
    mm.initialize({
      startOnLoad: false,
      theme: isDarkTheme() ? 'dark' : 'default',
      securityLevel: 'loose',
      themeVariables: {
        background: 'transparent',
        primaryColor: cssVar('--color-primary', '#6366f1'),
        primaryTextColor: cssVar('--color-primary-content', '#ffffff'),
        lineColor: cssVar('--color-base-content', '#1e293b'),
        nodeBorder: cssVar('--color-base-300', '#cbd5e1'),
        fontSize: '12px',
        ...(isDarkTheme() ? {
          primaryBorderColor: cssVar('--color-primary', '#6366f1'),
          secondaryColor: cssVar('--color-secondary', '#8b5cf6'),
          tertiaryColor: cssVar('--color-accent', '#f59e0b'),
          mainBkg: cssVar('--color-base-200', '#1e293b'),
          clusterBkg: cssVar('--color-base-200', '#1e293b'),
          clusterBorder: cssVar('--color-base-300', '#475569'),
          titleColor: cssVar('--color-base-content', '#e2e8f0'),
          edgeLabelBackground: cssVar('--color-base-200', '#1e293b'),
        } : {}),
      },
    })

    for (const el of elements) {
      const code = el.textContent || ''
      if (!code.trim()) continue
      try {
        const id = `mermaid-${++mermaidId}`
        const { svg } = await mm.render(id, code)
        el.innerHTML = svg
        el.setAttribute('data-processed', 'true')
      } catch {
        // Leave as code block if mermaid fails
      }
    }
  } catch {
    // Mermaid initialization failed (e.g., unsupported CSS vars) — leave as code blocks
  }
}

async function renderContent() {
  if (!contentRef.value) return

  // @ts-ignore - markdown-it default export doesn't have proper types
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  })

  const defaultRender = md.renderer.rules.fence || function (tokens: any[], idx: number, options: any, _env: any, self: any) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.fence = function (tokens: any[], idx: number, options: any, _env: any, self: any) {
    const token = tokens[idx]
    const info = token.info ? token.info.trim() : ''
    if (info === 'mermaid') {
      const code = token.content
      return `<div class="mermaid-diagram"><pre class="mermaid">${code}</pre></div>`
    }
    return defaultRender(tokens, idx, options, _env, self)
  }

  contentRef.value.innerHTML = md.render(props.content)

  // Wait for Vue/DOM to fully update
  await nextTick()
  await new Promise(resolve => requestAnimationFrame(resolve))
  await renderMermaid(contentRef.value!)
}

onMounted(() => {
  renderContent()
})

watch(() => props.content, () => {
  renderContent()
})

watch(() => document.documentElement.getAttribute('data-theme'), () => {
  renderContent()
})
</script>

<style scoped>
.markdown-body {
  font-size: 0.875rem;
}

.markdown-body :deep(h1) {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 1rem;
  margin-top: 1.5rem;
  color: var(--bs-body-color);
}

.markdown-body :deep(h2) {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  margin-top: 1.25rem;
  color: var(--bs-body-color);
}

.markdown-body :deep(h3) {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  margin-top: 1rem;
  color: var(--bs-body-color);
}

.markdown-body :deep(p) {
  margin-bottom: 1rem;
  color: var(--bs-body-color);
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin-bottom: 1rem;
  padding-left: 1.5rem;
}

.markdown-body :deep(li) {
  margin-bottom: 0.25rem;
  color: var(--bs-body-color);
}

.markdown-body :deep(ul) {
  list-style-type: disc;
}

.markdown-body :deep(ol) {
  list-style-type: decimal;
}

.markdown-body :deep(a) {
  color: var(--bs-link-color);
  text-decoration: underline;
}

.markdown-body :deep(a:hover) {
  color: var(--bs-link-hover-color);
}

.markdown-body :deep(code) {
  background-color: var(--bs-secondary-bg);
  color: var(--bs-code-color);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-family: monospace;
}

.markdown-body :deep(pre) {
  background-color: var(--bs-secondary-bg);
  color: var(--bs-body-color);
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin-bottom: 1rem;
  border: 1px solid var(--bs-border-color);
}

.markdown-body :deep(pre code) {
  background-color: transparent;
  padding: 0;
  color: inherit;
}

.markdown-body :deep(blockquote) {
  border-left: 4px solid var(--bs-border-color);
  padding-left: 1rem;
  font-style: italic;
  margin: 1rem 0;
  color: var(--bs-body-color);
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
  color: var(--bs-body-color);
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--bs-border-color);
  padding: 0.5rem 0.75rem;
}

.markdown-body :deep(th) {
  background-color: var(--bs-secondary-bg);
  font-weight: 600;
}

.markdown-body :deep(tr:nth-child(even)) {
  background-color: var(--bs-tertiary-bg);
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--bs-border-color);
  margin: 1.5rem 0;
}

.mermaid-diagram {
  margin: 1rem 0;
  display: flex;
  justify-content: center;
}

.mermaid-diagram :deep(svg) {
  max-width: 100%;
  height: auto;
}

.mermaid-diagram :deep(pre) {
  background-color: var(--bs-secondary-bg);
  border: 1px solid var(--bs-border-color);
}
</style>
