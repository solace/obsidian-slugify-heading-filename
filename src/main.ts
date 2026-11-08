import {
  App,
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  Plugin,
  PluginSettingTab,
  Setting,
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
            this.saveSettings();
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: 'slugify-heading-as-filename',
      name: 'Slugify Heading as Filename',
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
    this.app.vault.read(file).then(async (data) => {
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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

  display(): void {
    const { containerEl } = this;
    let regexIncludedFilesDiv: HTMLDivElement;

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
    containerEl.createEl('h2', { text: 'Slugify Heading as Filename' });
    containerEl.createEl('p', {
      text: 'This plugin will update the filename to the slugified version of the first h1 (if it exists).',
    });

    new Setting(containerEl)
      .setName('Include Regex Rule')
      .setDesc('Include rule in RegEx format. All files listed below will get included by this plugin.')
      .addText((text) =>
        text
          .setPlaceholder('MyFolder/.*')
          .setValue(this.plugin.settings.includeRegex)
          .onChange(async (value) => {
            try {
              new RegExp(value);
              this.plugin.settings.includeRegex = value;
            } catch {
              this.plugin.settings.includeRegex = '';
            }
            await this.plugin.saveSettings();
            renderRegexIncludedFiles(regexIncludedFilesDiv);
          }),
      );

    new Setting(containerEl)
      .setName('Sorting Delimiter')
      .setDesc('If you have filename-based sorting, eg. "1 -- A Title", what delimiter are you using?')
      .addText((delimiter) =>
        delimiter
          .setValue(this.plugin.settings.sortingDelimiter)
          .onChange(async (value) => {
            this.plugin.settings.sortingDelimiter = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Use File Open Hook')
      .setDesc('Whether this plugin should trigger when a file is opened, and not just on save. Disable this when you notice conflicts with other plugins that also act on file open.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useFileOpenHook)
          .onChange(async (value) => {
            this.plugin.settings.useFileOpenHook = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Use File Save Hook')
      .setDesc('Whether this plugin should trigger when a file is saved. Disable this when you want to trigger sync only manually.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useFileSaveHook)
          .onChange(async (value) => {
            this.plugin.settings.useFileSaveHook = value;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl('h2', { text: 'Included Files By Regex' });
    containerEl.createEl('p', { text: 'All files matching the above RegEx will get listed here' });

    regexIncludedFilesDiv = containerEl.createDiv('test');
    renderRegexIncludedFiles(regexIncludedFilesDiv);

    containerEl.createEl('h2', { text: 'Manually Included Files' });
    containerEl.createEl('p', {
      text: 'You can include files from this plugin by using the "include this file" command',
    });

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
