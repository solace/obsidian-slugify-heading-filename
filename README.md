# Obsidian Slugify Heading as Filename

This is an Obsidian plugin to keep the filename of a note synchronised with the slugified version of the first h1.

**Note:** This is a one way sync. It renames the file but *does not* change the h1. If you manually rename the file it *will not* change the h1.

## Acknowledgements & Attribution

This project is a filename slugification variation on [dvcrn/obsidian-filename-heading-sync
](https://github.com/dvcrn/obsidian-filename-heading-sync). 

* **Original Project:** https://github.com/dvcrn/obsidian-filename-heading-sync
* **Original Author:** David (dvcrn)
* **License:** [MIT License](https://github.com/dvcrn/obsidian-filename-heading-sync/blob/master/LICENSE)

## Features

- When updating the h1 of a file it will rename the file.
- Optional delimiter setting to account for filename-based sorting, eg. "1 -- A Title".
- Opt-in only: Only affects the files that you specify by regex.

## Use Case

- A subset of your vault will be published, and you want web-safe and SEO friendly slugs based on filename
- There are probably others

## Installation

This plugin is not available through the official Obsidian plugin repository, but it can be installed manually.

In settings, set *Include Regex Rule* to the path of the folder(s) you want slugified.

**Important:** If you are using [obsidian-filename-heading-sync](https://github.com/dvcrn/obsidian-filename-heading-sync), you will need to add this same path to that plugin's *Ignore Regex Rule* to make sure both don't try to process the titles at the same time.

## Troubleshooting

### Sorting

When choosing a delimiter, choose characters that are filename-safe and will not occur in your titles.
We can't reliably work with things that can naturally occur such as single (or double) spaces and hyphens.
