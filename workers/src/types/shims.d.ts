declare module 'remove-markdown' {
  function removeMd(input: string, options?: any): string;
  export default removeMd;
}

declare module 'slugify' {
  function slugify(input: string, opts?: any): string;
  export default slugify;
}

declare module 'yt-dlp-wrap' {
  export default class YTDlpWrap {
    constructor(binaryPath?: string);
    
    getBinaryPath(): string;
    
    execPromise(args: string[]): Promise<string>;
    
    exec(
      args: string[],
      options?: any,
      callback?: (error: Error | null, output: string) => void
    ): any;
  }
}

