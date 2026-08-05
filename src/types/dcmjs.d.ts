declare module "dcmjs" {
  export const DicomMessage: {
    readFile: (buffer: ArrayBuffer) => { dict: unknown };
  };
  export const DicomMetaDictionary: {
    naturalizeDataset: (dict: unknown) => Record<string, unknown>;
  };
}
