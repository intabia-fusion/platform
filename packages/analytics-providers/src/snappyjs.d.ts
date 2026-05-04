declare module 'snappyjs' {
  export function compress (input: Uint8Array | Buffer): Uint8Array
  export function uncompress (input: Uint8Array | ArrayBuffer | Buffer): Uint8Array
}
