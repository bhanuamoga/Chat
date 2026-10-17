declare module "mammoth/mammoth.browser" {
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer } | { path: string },
    options?: Record<string, unknown>
  ): Promise<{ value: string; messages: unknown[] }>;
  const _default: { convertToHtml: typeof convertToHtml };
  export default _default;
}
