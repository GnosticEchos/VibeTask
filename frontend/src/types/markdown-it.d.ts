declare module 'markdown-it' {
  interface MarkdownIt {
    render(markdown: string, env?: Record<string, any>): string
    renderInline(markdown: string, env?: Record<string, any>): string
    parse(markdown: string, env?: Record<string, any>): any[]
    options: Record<string, any>
    utils: Record<string, any>
    renderer: {
      rules: Record<string, any>
      render(tokens: any[], options: any, env: any): string
      renderToken(tokens: any[], idx: number, options: any): string
    }
    core: {
      ruler: {
        push(name: string, fn: (state: any) => void): void
        before(before: string, name: string, fn: (state: any, startLine: number, endLine: number, silent: boolean) => boolean): void
        after(after: string, name: string, fn: (state: any, silent: boolean) => boolean): void
        at(name: string, fn: (state: any) => void): void
        enable(rules: string | string[]): void
        disable(rules: string | string[]): void
        enableOnly(rules: string | string[]): void
      }
    }
    block: { ruler: any }
    inline: { ruler: any }
    linkify: {
      set(options: Record<string, any>): void
      add(schema: string, prefix: string | Record<string, any>): void
    }
    enable(rules: string | string[]): any
    disable(rules: string | string[]): any
  }

  interface MarkdownItOptions {
    html?: boolean
    xhtmlOut?: boolean
    breaks?: boolean
    langPrefix?: string
    linkify?: boolean
    typographer?: boolean
    quotes?: string
    highlight?: (str: string, lang: string) => string
  }

  function markdownit(preset?: 'commonmark' | 'zero' | 'default' | string, options?: MarkdownItOptions): MarkdownIt
  function markdownit(options?: MarkdownItOptions): MarkdownIt

  export default markdownit
}