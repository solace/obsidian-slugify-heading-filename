import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  Editor,
  MarkdownView,
} from 'obsidian';
import { isExcluded } from './exclusions';

// Must be Strings unless settings dialog is updated.
const enum HeadingStyle {
  Prefix = 'Prefix',
  Underline = 'Underline',
}

interface LinePointer {
  lineNumber: number;
  text: string;
  style: HeadingStyle;
}

interface FilenameSlugHeadingSyncPluginSettings {
  includeRegex: string;
  includedFiles: { [key: string]: null };
  useFileOpenHook: boolean;
  useFileSaveHook: boolean;
}

const DEFAULT_SETTINGS: FilenameSlugHeadingSyncPluginSettings = {
  includedFiles: {},
  includeRegex: '',
  useFileOpenHook: true,
  useFileSaveHook: true,
};

export default class FilenameSlugHeadingSyncPlugin extends Plugin {
  isRenameInProgress: boolean = false;
  settings: FilenameSlugHeadingSyncPluginSettings;

  async onload() {
    await this.loadSettings();

    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (this.settings.useFileSaveHook) {
          return this.handleRenameFile(file);
        }
      }),
    );

    this.addSettingTab(new SlugifyHeadingFilenameSettingTab(this.app, this));

    this.addCommand({
      id: 'page-heading-sync-include-file',
      name: 'Include current file',
      checkCallback: (checking: boolean) => {
        let leaf = this.app.workspace.activeLeaf;
        if (leaf) {
          if (!checking) {
            this.settings.includedFiles[
              this.app.workspace.getActiveFile().path
              ] = null;
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
      editorCallback: (editor: Editor, view: MarkdownView) =>
        this.forceRenameFile(view.file),
    });
  }

  fileIsIncluded(activeFile: TFile, path: string): boolean {
    // check exclusions
    if (isExcluded(this.app, activeFile)) {
      return true;
    }

    // check manual include
    if (this.settings.includedFiles[path] !== undefined) {
      return true;
    }

    // check regex
    try {
      if (this.settings.includeRegex === '') {
        return;
      }

      const reg = new RegExp(this.settings.includeRegex);
      return reg.exec(path) !== null;
    } catch {}

    return false;
  }

  /**
   * Renames the file with the first heading found
   *
   * @param      {TAbstractFile}  file    The file
   */
  handleRenameFile(file: TAbstractFile) {
    if (!(file instanceof TFile)) {
      return;
    }

    if (file.extension !== 'md') {
      // just bail
      return;
    }

    // if currently opened file is not the same as the one that fired the event, skip
    // this is to make sure other events don't trigger this plugin
    if (this.app.workspace.getActiveFile() !== file) {
      return;
    }

    // if included, just bail
    if (!this.fileIsIncluded(file, file.path)) {
      return;
    }

    this.forceRenameFile(file);
  }

  forceRenameFile(file: TFile) {
    this.app.vault.read(file).then(async (data) => {
      const lines = data.split('\n');
      const start = this.findNoteStart(lines);
      const heading = this.findHeading(lines, start);

      if (heading === null) return; // no heading found, nothing to do here

      const slugifiedHeading = this.slugify(heading.text);
      if (
        slugifiedHeading.length > 0 &&
        this.slugify(file.basename) !== slugifiedHeading
      ) {
        const newPath = `${file.parent.path}/${slugifiedHeading}.md`;
        this.isRenameInProgress = true;
        await this.app.fileManager.renameFile(file, newPath);
        this.isRenameInProgress = false;
      }
    });
  }

  /**
   * Finds the start of the note file, excluding frontmatter
   *
   * @param {string[]} fileLines array of the file's contents, line by line
   * @returns {number} zero-based index of the starting line of the note
   */
  findNoteStart(fileLines: string[]) {
    // check for frontmatter by checking if first line is a divider ('---')
    if (fileLines[0] === '---') {
      // find end of frontmatter
      // if no end is found, then it isn't really frontmatter and function will end up returning 0
      for (let i = 1; i < fileLines.length; i++) {
        if (fileLines[i] === '---') {
          // end of frontmatter found, next line is start of note
          return i + 1;
        }
      }
    }
    return 0;
  }

  /**
   * Finds the first heading of the note file
   *
   * @param {string[]} fileLines array of the file's contents, line by line
   * @param {number} startLine zero-based index of the starting line of the note
   * @returns {LinePointer | null} LinePointer to heading or null if no heading found
   */
  findHeading(fileLines: string[], startLine: number): LinePointer | null {
    for (let i = startLine; i < fileLines.length; i++) {
      if (fileLines[i].startsWith('# ')) {
        return {
          lineNumber: i,
          text: fileLines[i].substring(2),
          style: HeadingStyle.Prefix,
        };
      } else {
        if (
          fileLines[i + 1] !== undefined &&
          fileLines[i + 1].match(/^=+$/) !== null
        ) {
          return {
            lineNumber: i,
            text: fileLines[i],
            style: HeadingStyle.Underline,
          };
        }
      }
    }
    return null; // no heading found
  }

  /**
   * https://byby.dev/js-slugify-string
   */
  slugify(text: string) {
    return String(text)
      .normalize('NFKD') // split accented characters into their base characters and diacritical marks
      .replace(/[\u0300-\u036f]/g, '') // remove all the accents, which happen to be all in the \u03xx UNICODE block.
      .trim() // trim leading or trailing whitespace
      .toLowerCase() // convert to lowercase
      .replace(/[^a-z0-9 -]/g, '') // remove non-alphanumeric characters
      .replace(/\s+/g, '-') // replace spaces with hyphens
      .replace(/-+/g, '-'); // remove consecutive hyphens
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
  app: App;

  constructor(app: App, plugin: FilenameSlugHeadingSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.app = app;
  }

  display(): void {
    let { containerEl } = this;
    let regexIncludedFilesDiv: HTMLDivElement;

    const renderRegexIncludedFiles = (div: HTMLElement) => {
      // empty existing div
      div.innerHTML = '';

      if (this.plugin.settings.includeRegex === '') {
        return;
      }

      try {
        const files = this.app.vault.getFiles();
        const reg = new RegExp(this.plugin.settings.includeRegex);

        files
          .filter((file) => reg.exec(file.path) !== null)
          .forEach((el) => {
            new Setting(div).setDesc(el.path);
          });
      } catch (e) {
        return;
      }
    };

    containerEl.empty();

    containerEl.createEl('h2', { text: 'Slugify Heading as Filename' });
    containerEl.createEl('p', {
      text:
        'This plugin will update the filename to the slugified version of the first h1 (if it exists).',
    });

    new Setting(containerEl)
      .setName('Include Regex Rule')
      .setDesc(
        'Include rule in RegEx format. All files listed below will get included by this plugin.',
      )
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
      .setName('Use File Open Hook')
      .setDesc(
        'Whether this plugin should trigger when a file is opened, and not just on save. Disable this when you notice conflicts with other plugins that also act on file open.',
      )
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
      .setDesc(
        'Whether this plugin should trigger when a file is saved. Disable this when you want to trigger sync only manually.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useFileSaveHook)
          .onChange(async (value) => {
            this.plugin.settings.useFileSaveHook = value;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl('h2', { text: 'Included Files By Regex' });
    containerEl.createEl('p', {
      text: 'All files matching the above RegEx will get listed here',
    });

    regexIncludedFilesDiv = containerEl.createDiv('test');
    renderRegexIncludedFiles(regexIncludedFilesDiv);

    containerEl.createEl('h2', { text: 'Manually Included Files' });
    containerEl.createEl('p', {
      text:
        'You can include files from this plugin by using the "include this file" command',
    });

    // go over all included files and add them
    for (let key in this.plugin.settings.includedFiles) {
      const includedFilesSettingsObj = new Setting(containerEl).setDesc(key);

      includedFilesSettingsObj.addButton((button) => {
        button.setButtonText('Delete').onClick(async () => {
          delete this.plugin.settings.includedFiles[key];
          await this.plugin.saveSettings();
          this.display();
        });
      });
    }
  }
}
