declare module 'html2pdf.js' {
  interface Html2PdfInstance {
    set: (opt: Record<string, any>) => Html2PdfInstance
    from: (el: HTMLElement | string) => Html2PdfInstance
    save: (filename?: string) => Promise<void>
  }
  export default function html2pdf (): Html2PdfInstance
}
