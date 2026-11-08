export interface FilenameSlugHeadingSyncPluginSettings {
  includeRegex: string;
  includedFiles: { [key: string]: null };
  sortingDelimiter: string;
  useFileOpenHook: boolean;
  useFileSaveHook: boolean;
}

export const DEFAULT_SETTINGS: FilenameSlugHeadingSyncPluginSettings = {
  includedFiles: {},
  includeRegex: '',
  sortingDelimiter: '',
  useFileOpenHook: true,
  useFileSaveHook: true,
};
