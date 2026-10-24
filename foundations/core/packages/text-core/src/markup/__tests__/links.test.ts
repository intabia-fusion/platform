//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { extractLinks, hasOnlyLinks } from '../links'
import { MarkupNode } from '../model'

function doc (...content: MarkupNode[]): MarkupNode {
  return { type: 'doc', content: [{ type: 'paragraph', content }] } as any
}

function para (...content: MarkupNode[]): MarkupNode {
  return { type: 'paragraph', content } as any
}

function root (...content: MarkupNode[]): MarkupNode {
  return { type: 'doc', content } as any
}

function code (value: string): MarkupNode {
  return { type: 'text', text: value, marks: [{ type: 'code' }] } as any
}

function codeBlock (value?: string): MarkupNode {
  return { type: 'codeBlock', content: value !== undefined ? [{ type: 'text', text: value }] : undefined } as any
}

function hosts (content: MarkupNode, limit?: number): string[] {
  return extractLinks(content, limit).map((l) => l.host)
}

function text (value: string, href?: string): MarkupNode {
  return {
    type: 'text',
    text: value,
    ...(href !== undefined ? { marks: [{ type: 'link', attrs: { href, target: '_blank' } }] } : {})
  } as any
}

describe('extractLinks', () => {
  it('takes the href of a link mark, not its text', () => {
    expect(extractLinks(doc(text('the PR', 'https://github.com/org/repo/pull/1')))).toEqual([
      { url: 'https://github.com/org/repo/pull/1', host: 'github.com' }
    ])
  })

  it('finds bare urls in plain text and drops sentence punctuation', () => {
    const links = extractLinks(doc(text('see https://www.example.com/a?b=1. And (http://x.org/wiki/A_(b)), ok')))
    expect(links).toEqual([
      { url: 'https://www.example.com/a?b=1', host: 'example.com' },
      { url: 'http://x.org/wiki/A_(b)', host: 'x.org' }
    ])
  })

  it('stops at the limit', () => {
    expect(extractLinks(doc(text('https://a.io https://b.io https://c.io')), 2).map((l) => l.host)).toEqual([
      'a.io',
      'b.io'
    ])
  })

  it('trims a long run of punctuation in linear time', () => {
    const started = Date.now()
    expect(extractLinks(doc(text('https://a.io/' + '.'.repeat(100_000) + 'x')))).toHaveLength(1)
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('keeps each url once, in order', () => {
    const links = extractLinks(doc(text('https://a.io', 'https://a.io'), text(' and https://b.io and https://a.io')))
    expect(links.map((l) => l.host)).toEqual(['a.io', 'b.io'])
  })

  it('ignores non web protocols and malformed values', () => {
    const links = extractLinks(doc(text('mail', 'mailto:a@b.c'), text('x', 'javascript:alert(1)'), text('y', 'nope')))
    expect(links).toEqual([])
  })

  it('skips urls in inline code and code blocks', () => {
    const inline = { type: 'text', text: 'curl https://api.io/v1', marks: [{ type: 'code' }] } as any
    const block = { type: 'codeBlock', content: [{ type: 'text', text: 'GET https://log.io/x' }] } as any
    const content = { type: 'doc', content: [{ type: 'paragraph', content: [inline] }, block] } as any
    expect(extractLinks(content)).toEqual([])
  })

  it('keeps a cyrillic host as typed, not in punycode', () => {
    expect(extractLinks(doc(text('https://www.кто.рф/путь')))).toEqual([
      { url: 'https://www.xn--j1ail.xn--p1ai/%D0%BF%D1%83%D1%82%D1%8C', host: 'кто.рф' }
    ])
  })

  it('takes the host without the user and the port', () => {
    expect(extractLinks(doc(text('x', 'https://me@Example.com:8080/a')))[0].host).toBe('example.com')
  })

  it('takes the host of an address written without slashes or with backslashes', () => {
    expect(extractLinks(doc(text('x', 'http:example.com')))).toEqual([
      { url: 'http://example.com/', host: 'example.com' }
    ])
    expect(hosts(doc(text('x', 'http:\\\\Example.com\\a')))).toEqual(['example.com'])
    expect(hosts(doc(text('x', 'http:///example.com')))).toEqual(['example.com'])
  })

  it('stops the host at the path, the query or the fragment, and keeps an ipv6 host whole', () => {
    expect(hosts(doc(text('https://a.io?x=1 https://b.io#top https://c.io/p')))).toEqual(['a.io', 'b.io', 'c.io'])
    expect(hosts(doc(text('x', 'http://[::1]:8080/a')))).toEqual(['[::1]'])
    expect(hosts(doc(text('x', 'http://[::1]/a')))).toEqual(['[::1]'])
  })

  it('lowers the case of the host and drops www only at its start', () => {
    expect(hosts(doc(text('HTTPS://WWW.Example.COM/A')))).toEqual(['example.com'])
    expect(hosts(doc(text('https://wwwx.io')))).toEqual(['wwwx.io'])
  })

  it('takes one url however its form differs', () => {
    expect(hosts(doc(text('https://a.io https://a.io/ HTTPS://A.IO')))).toEqual(['a.io'])
  })

  it('skips a link mark without an address', () => {
    const noHref = { type: 'text', text: 'x', marks: [{ type: 'link', attrs: {} }] } as any
    const noAttrs = { type: 'text', text: 'y', marks: [{ type: 'link' }] } as any
    expect(extractLinks(doc(noHref, noAttrs, text('z', '')))).toEqual([])
  })

  it('reads a text node without text as empty', () => {
    expect(extractLinks(doc({ type: 'text' } as any))).toEqual([])
  })

  it('stops at the limit across paragraphs', () => {
    expect(hosts(root(para(text('https://a.io')), para(text('https://b.io')), para(text('https://c.io'))), 1)).toEqual([
      'a.io'
    ])
  })

  it('finds urls inside lists, quotes and tables', () => {
    const list = { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('https://a.io'))] }] } as any
    const quote = { type: 'blockquote', content: [para(text('https://b.io'))] } as any
    const table = {
      type: 'table',
      content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para(text('https://c.io'))] }] }]
    } as any
    expect(hosts(root(list, quote, table))).toEqual(['a.io', 'b.io', 'c.io'])
  })

  it('keeps a bracket the url opened and drops one that only closes the sentence', () => {
    expect(extractLinks(doc(text('(see https://x.org/a_(b)).')))[0].url).toBe('https://x.org/a_(b)')
    expect(extractLinks(doc(text('(https://x.org/a)')))[0].url).toBe('https://x.org/a')
  })

  it('drops quotes and closing marks after a url', () => {
    const links = extractLinks(doc(text('«https://a.io/x» "https://b.io/y" https://c.io/z!?')))
    expect(links.map((l) => l.url)).toEqual(['https://a.io/x', 'https://b.io/y', 'https://c.io/z'])
  })

  it('takes a url only from its scheme, not from a word that ends with one', () => {
    expect(extractLinks(doc(text('xhttps://a.io')))).toEqual([])
  })

  it('returns nothing for an empty document', () => {
    expect(extractLinks({ type: 'doc', content: [] } as any)).toEqual([])
  })
})

describe('hasOnlyLinks', () => {
  it('is true for an empty document', () => {
    expect(hasOnlyLinks(root())).toBe(true)
  })

  it('is true for links in several paragraphs, lines and table cells', () => {
    const br = { type: 'hardBreak' } as any
    const table = {
      type: 'table',
      content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para(text('https://c.io'))] }] }]
    } as any
    expect(hasOnlyLinks(root(para(text('https://a.io'), br, text('https://b.io')), table))).toBe(true)
  })

  it('reads a text node without text as empty', () => {
    expect(hasOnlyLinks(doc({ type: 'text' } as any))).toBe(true)
  })

  it('takes a link without an address by its text', () => {
    const noHref = { type: 'text', text: 'https://a.io', marks: [{ type: 'link' }] } as any
    const words = { type: 'text', text: 'read', marks: [{ type: 'link' }] } as any
    expect(hasOnlyLinks(doc(noHref))).toBe(true)
    expect(hasOnlyLinks(doc(words))).toBe(false)
  })

  it('takes a link that shows another url for an address, but not one with words after it', () => {
    expect(hasOnlyLinks(doc(text('https://short.io/x', 'https://long.io/y')))).toBe(true)
    expect(hasOnlyLinks(doc(text('https://a.io read this', 'https://a.io')))).toBe(false)
  })

  it('counts a file, a diagram or an embed as words', () => {
    for (const type of ['image', 'file', 'mermaid', 'embed']) {
      expect(hasOnlyLinks(root(para(text('https://a.io')), { type } as any))).toBe(false)
    }
  })

  it('leaves out an empty code block and empty inline code', () => {
    const noText = { type: 'codeBlock', content: [{ type: 'text' }] } as any
    expect(hasOnlyLinks(root(codeBlock(), codeBlock('  '), noText, para(code(' '), text('https://a.io'))))).toBe(true)
  })

  it('counts words of code without a url', () => {
    expect(hasOnlyLinks(doc(code('npm i'), text(' https://a.io')))).toBe(false)
    expect(hasOnlyLinks(root(codeBlock('ls -la'), para(text('https://a.io'))))).toBe(false)
  })

  it('counts words in any cell of a table', () => {
    const table = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [para(text('https://a.io'))] },
            { type: 'tableCell', content: [para(text('price'))] }
          ]
        }
      ]
    } as any
    expect(hasOnlyLinks(root(table))).toBe(false)
  })

  it('takes digits and letters of any script for words', () => {
    expect(hasOnlyLinks(doc(text('42 https://a.io')))).toBe(false)
    expect(hasOnlyLinks(doc(text('смотри https://a.io')))).toBe(false)
  })

  it('is true for a bare url or a link that shows its url', () => {
    expect(hasOnlyLinks(doc(text('https://example.com')))).toBe(true)
    expect(hasOnlyLinks(doc(text('https://x.org', 'https://x.org')))).toBe(true)
    expect(hasOnlyLinks(doc(text('https://a.com '), text('https://b.com/', 'https://b.com/')))).toBe(true)
  })

  it('ignores the punctuation that ends a sentence after a url', () => {
    expect(hasOnlyLinks(doc(text('https://example.com.')))).toBe(true)
  })

  it('is false when words come with the url', () => {
    expect(hasOnlyLinks(doc(text('see https://example.com')))).toBe(false)
    expect(hasOnlyLinks(doc(text('PR: https://example.com')))).toBe(false)
  })

  it('takes a typed domain the editor linked for an address', () => {
    expect(hasOnlyLinks(doc(text('example.com', 'http://example.com')))).toBe(true)
    expect(hasOnlyLinks(doc(text('www.example.com/a', 'https://example.com/a/')))).toBe(true)
  })

  it('ignores brackets, quotes and dashes around a url', () => {
    expect(hasOnlyLinks(doc(text('(https://example.com)')))).toBe(true)
    expect(hasOnlyLinks(doc(text('— «https://example.com»')))).toBe(true)
  })

  it('counts a mention, an emoji or a picture as words', () => {
    const mention = { type: 'reference', attrs: { id: 'p1', label: 'Alice' } } as any
    const emoji = { type: 'emoji', attrs: { emoji: '👍' } } as any
    expect(hasOnlyLinks(doc(mention, text(' https://example.com')))).toBe(false)
    expect(hasOnlyLinks(doc(text('https://example.com '), emoji))).toBe(false)
  })

  it('counts code as words, a url in it included', () => {
    const inline = { type: 'text', text: 'https://api.io/v1', marks: [{ type: 'code' }] } as any
    const block = { type: 'codeBlock', content: [{ type: 'text', text: 'https://log.io/x' }] } as any
    expect(hasOnlyLinks(doc(inline, text(' https://example.com')))).toBe(false)
    expect(
      hasOnlyLinks({ type: 'doc', content: [block, { type: 'paragraph', content: [text('https://a.io')] }] } as any)
    ).toBe(false)
  })

  it('is false for a link with words of its own', () => {
    expect(hasOnlyLinks(doc(text('the PR', 'https://github.com/org/repo/pull/1')))).toBe(false)
  })
})
