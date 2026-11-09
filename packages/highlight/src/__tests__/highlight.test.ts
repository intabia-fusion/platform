import hljs from 'highlight.js'
import { highlightLines, highlightText } from '../index'

// highlight.js already includes its built-in grammars; skip lowlight's ESM registry in Jest.
jest.mock('lowlight', () => ({ all: {} }))

const script = `    <script type="text/javascript">
      (function (m, e, t, r, i, k, a) {
        m[i] =
          m[i] ||
          function () {
            (m[i].a = m[i].a || []).push(arguments);
          };
        m[i].l = 1 * new Date();
        for (let j = 0; j < document.scripts.length; j++) {
          if (document.scripts[j].src === r) {
            return;
          }
        }
        ((k = e.createElement(t)),
          (a = e.getElementsByTagName(t)[0]),
          (k.async = 1),
          (k.src = r),
          a.parentNode.insertBefore(k, a));
      })(
        window,
        document,
        "script",
        "https://mc.yandex.ru/metrika/tag.js?id=108262213",
        "ym",
      );

      ym(108262213, "init", {
        ssr: true,
        webvisor: true,
        clickmap: true,
        ecommerce: "dataLayer",
        referrer: document.referrer,
        url: location.href,
        accurateTrackBounce: true,
        trackLinks: true,
      });
    </script>`

function textContent (html: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#x27;': "'"
  }
  return html.replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|#x27);/g, (entity) => entities[entity])
}

describe('highlightText', () => {
  it.each(['astro', 'unknown-code-language', undefined, '', null])(
    'escapes script blocks when language is %s',
    (language) => {
      const html = highlightText(script, { language })

      expect(html).toContain('&lt;script')
      expect(html).toContain('&lt;/script&gt;')
      expect(html).not.toContain('<')
      expect(textContent(html)).toBe(script)
    }
  )

  it('preserves whitespace, entities and HTML-like text without interpreting them', () => {
    const text = '\t<div title="test">\n\n  a < b && b > c; &lt;span&gt; \'quoted\'\n</div>\n'
    const html = highlightText(text, { language: undefined })

    expect(html).not.toContain('<')
    expect(html).toContain('&amp;lt;span&amp;gt;')
    expect(textContent(html)).toBe(text)
  })

  it('preserves syntax highlighting for a known language', () => {
    const text = 'const value = "<script> & </script>"'
    const html = highlightText(text, { language: 'javascript' })

    expect(html).toBe(hljs.highlight(text, { language: 'javascript' }).value)
    expect(html).toContain('class="hljs-keyword"')
    expect(textContent(html)).toBe(text)
  })

  it('keeps automatic detection opt-in', () => {
    const text = 'const value = "<script> & </script>"'
    const html = highlightText(text, { language: undefined, auto: true })

    expect(html).toBe(hljs.highlightAuto(text).value)
    expect(textContent(html)).toBe(text)
    expect(highlightText(text, { language: 'javascript', auto: true })).toBe(
      hljs.highlight(text, { language: 'javascript' }).value
    )
  })

  it('renders empty code as empty text', () => {
    expect(highlightText('', { language: null })).toBe('')
  })
})

describe('highlightLines', () => {
  it('preserves every line of a script with an unknown language', () => {
    const lines = [...script.split('\n'), '']
    const highlighted = highlightLines(lines, { language: 'astro' })

    expect(highlighted).toHaveLength(lines.length)
    expect(highlighted.map(textContent)).toEqual(lines)
    expect(highlighted.every((line) => !line.includes('<'))).toBe(true)
  })

  it('balances highlight spans across multiline tokens', () => {
    const lines = ['/* <script>', '', '  & </script> */', 'const value = 1', '']
    const highlighted = highlightLines(lines, { language: 'javascript' })

    expect(highlighted.map(textContent)).toEqual(lines)
    for (const line of highlighted) {
      expect(line.match(/<span\b/g)?.length ?? 0).toBe(line.match(/<\/span>/g)?.length ?? 0)
    }
  })
})
