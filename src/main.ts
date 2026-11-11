import {
  App,
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  Plugin,
  PluginSettingTab,
  Setting,
  SettingDefinitionItem,
  TAbstractFile,
  TFile,
} from 'obsidian';
import { isExcluded } from './exclusions';
import {
  DEFAULT_SETTINGS,
  FilenameSlugHeadingSyncPluginSettings,
} from './settings';

enum HeadingStyle {
  Prefix = 'Prefix',
  Underline = 'Underline',
}

interface LinePointer {
  lineNumber: number;
  text: string;
  style: HeadingStyle;
}

export default class FilenameSlugHeadingSyncPlugin extends Plugin {
  isRenameInProgress = false;
  settings!: FilenameSlugHeadingSyncPluginSettings;

  async onload() {
    await this.loadSettings();

    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (this.settings.useFileSaveHook) {
          this.handleRenameFile(file);
        }
      }),
    );

    this.addSettingTab(new SlugifyHeadingFilenameSettingTab(this.app, this));

    this.addCommand({
      id: 'page-heading-sync-include-file',
      name: 'Include current file',
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          if (!checking) {
            this.settings.includedFiles[activeFile.path] = null;
            void this.saveSettings();
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: 'slugify-heading-as-filename',
      name: 'Force slugify filename',
      editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        if (ctx.file) this.forceRenameFile(ctx.file);
      },
    });
  }

  fileIsIncluded(activeFile: TFile, path: string): boolean {
    if (isExcluded(this.app, activeFile)) {
      return true;
    }

    if (this.settings.includedFiles[path] !== undefined) {
      return true;
    }

    if (this.settings.includeRegex === '') {
      return false;
    }

    try {
      const reg = new RegExp(this.settings.includeRegex);
      return reg.exec(path) !== null;
    } catch {
      return false;
    }
  }

  handleRenameFile(file: TAbstractFile) {
    if (!(file instanceof TFile)) return;
    if (file.extension !== 'md') return;
    if (this.app.workspace.getActiveFile() !== file) return;
    if (!this.fileIsIncluded(file, file.path)) return;

    this.forceRenameFile(file);
  }

  forceRenameFile(file: TFile) {
    void this.app.vault.read(file).then(async (data) => {
      const lines = data.split('\n');
      const start = this.findNoteStart(lines);
      const heading = this.findHeading(lines, start);

      if (heading === null) return;

      const regex = new RegExp(
        `^((?<order>\\d[\\d\\.]*)${this.settings.sortingDelimiter})?(?<title>.*)$`,
      );
      const slugifiedHeading = this.slugify(heading.text);
      if (slugifiedHeading.length === 0) return;

      const matches = file.basename.match(regex);
      if (!matches || matches.groups?.['title'] === slugifiedHeading) return;

      const order = matches.groups?.['order'];
      const newName = [order, slugifiedHeading]
        .filter(Boolean)
        .join(this.settings.sortingDelimiter ?? '');
      const parentPath = file.parent?.path ?? '';
      const newPath = parentPath ? `${parentPath}/${newName}.md` : `${newName}.md`;

      this.isRenameInProgress = true;
      await this.app.fileManager.renameFile(file, newPath);
      this.isRenameInProgress = false;
    });
  }

  findNoteStart(fileLines: string[]): number {
    if (fileLines[0] !== '---') return 0;
    for (let i = 1; i < fileLines.length; i++) {
      if (fileLines[i] === '---') return i + 1;
    }
    return 0;
  }

  findHeading(fileLines: string[], startLine: number): LinePointer | null {
    for (let i = startLine; i < fileLines.length; i++) {
      const line = fileLines[i];
      if (line === undefined) continue;

      if (line.startsWith('# ')) {
        return { lineNumber: i, text: line.substring(2), style: HeadingStyle.Prefix };
      }

      const nextLine = fileLines[i + 1];
      if (nextLine !== undefined && nextLine.match(/^=+$/) !== null) {
        return { lineNumber: i, text: line, style: HeadingStyle.Underline };
      }
    }
    return null;
  }

  slugify(text: string): string {
    return String(text)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[/\\]/g, '-')
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<FilenameSlugHeadingSyncPluginSettings>);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class SlugifyHeadingFilenameSettingTab extends PluginSettingTab {
  plugin: FilenameSlugHeadingSyncPlugin;

  constructor(app: App, plugin: FilenameSlugHeadingSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: 'Slugify Heading as Filename',
        desc: 'This plugin will update the filename to the slugified version of the first h1 (if it exists).',
      },
      {
        name: 'Include Regex Rule',
        desc: 'Include rule in RegEx format. All files matching this regex will be included by this plugin.',
        control: { type: 'text', key: 'includeRegex', placeholder: 'MyFolder/.*' },
      },
      {
        name: 'Sorting Delimiter',
        desc: 'If you have filename-based sorting, eg. "1 -- A Title", what delimiter are you using?',
        control: { type: 'text', key: 'sortingDelimiter' },
      },
      {
        name: 'Use File Save Hook',
        desc: 'Whether this plugin should trigger when a file is saved. Disable this when you want to trigger sync only manually.',
        control: { type: 'toggle', key: 'useFileSaveHook' },
      },
      {
        name: 'Use File Open Hook',
        desc: 'Whether this plugin should trigger when a file is opened, and not just on save. Disable this when you notice conflicts with other plugins that also act on file open.',
        control: { type: 'toggle', key: 'useFileOpenHook' },
      },
    ];
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof FilenameSlugHeadingSyncPluginSettings];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
    await this.plugin.saveSettings();
  }

  display(): void {
    const { containerEl } = this;

    const renderRegexIncludedFiles = (div: HTMLElement) => {
      div.innerHTML = '';
      if (this.plugin.settings.includeRegex === '') return;
      try {
        const files = this.app.vault.getFiles();
        const reg = new RegExp(this.plugin.settings.includeRegex);
        files
          .filter((file) => reg.exec(file.path) !== null)
          .forEach((el) => new Setting(div).setDesc(el.path));
      } catch {
        return;
      }
    };

    containerEl.empty();

    new Setting(containerEl)
      .setName('Included Files By Regex')
      .setDesc('All files matching the above regex will get listed here.')
      .setHeading();

    const regexIncludedFilesDiv = containerEl.createDiv();
    renderRegexIncludedFiles(regexIncludedFilesDiv);

    new Setting(containerEl)
      .setName('Manually Included Files')
      .setDesc('You can include files from this plugin by using the "include this file" command.')
      .setHeading();

    for (const key in this.plugin.settings.includedFiles) {
      new Setting(containerEl).setDesc(key).addButton((button) =>
        button.setButtonText('Delete').onClick(async () => {
          delete this.plugin.settings.includedFiles[key];
          await this.plugin.saveSettings();
          this.display();
        }),
      );
    }
  }
}
