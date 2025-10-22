declare module 'remove-markdown' {
  function removeMd(input: string, options?: any): string;
  export default removeMd;
}

declare module 'slugify' {
  function slugify(input: string, opts?: any): string;
  export default slugify;
}
