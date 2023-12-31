# Obsidian Slugify Heading as Filename

This is an Obsidian plugin to keep the filename of a note synchronised with the slugified version of the first h1.

**Note:** This is a one way sync. It renames the file but *does not* change the h1. If you manually rename the file it *will not* change the h1.

## Features

- When updating the h1 of a file it will rename the file.
- Optional delimiter setting to account for filename-based sorting, eg. "1 -- A Title".
- Opt in only: Only affects the files that you specify by regex.

## Use Case

- A subset of your vault will be published, and you want web-safe and SEO friendly slugs based on filename
- There are probably others

## Limitations

This is most likely incompatible with [obsidian-filename-heading-sync](https://github.com/dvcrn/obsidian-filename-heading-sync). But if you use the exclusion regex from that plugin in the inclusion regex for this one, it will ensure there is no overlap.

## Troubleshooting

### Sorting

When choosing a delimiter, choose characters that are filename-safe and will not occur in your titles.
We can't reliably work with things that can naturally occur such as single (or double) spaces and hyphens.

## LICENSE

MIT
