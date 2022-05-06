import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { YoutubeView, YOUTUBE_VIEW } from './view/YoutubeView';
import { YouTubePlayer } from 'react-youtube';

interface MyPluginSettings {
	mySetting: string;
	player: YouTubePlayer;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: "",
	player: undefined
}


export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	// Helper function to validate url and activate view
	validateURL = (url: string) => {
		const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
		const match = url.match(regExp);
		if (match && match[7].length == 11) {

			// Activate the view with the valid link
			this.activateView(match[7].toString().trim());
			return "\n" + this.settings.mySetting
		}
		return "\n The copied link is not a valid youtube url. Please try again with a valid link.\n"
	}

	async onload() {
		// Register view
		this.registerView(
			YOUTUBE_VIEW,
			(leaf) => new YoutubeView(leaf)
		);

		// Register settings
		await this.loadSettings();

		// Create ribbon button that opens modal to use for inserting YouTube url
		this.addRibbonIcon("note-glyph", "Youtube Timestamp Notes", () => {
			new YoutubeModal(this.app, async (result) => {
				new Notice(`Opening, ${result}!`)
				await this.validateURL(result.trim());
			}).open();
		});

		// Markdown processor that turns timestamps into buttons
		this.registerMarkdownCodeBlockProcessor("yt", (source, el, ctx) => {
			const regExp = /\d+:\d+:\d+|\[\d+:\d+\]/g;
			const rows = source.split("\n").filter((row) => row.length > 0);
			rows.forEach((row) => {
				const match = row.match(regExp);
				if (match) {
					const div = el.createEl("div");
					const button = div.createEl("button");

					button.innerText = match[0];
					button.addEventListener("click", () => {
						const hhmmss = match[0].replace(/\[|\]/g, "");
						//convert hhmmss format to seconds where there might not be hh
						const timeArr = hhmmss.split(":").map((v) => parseInt(v));
						const [hh, mm, ss] = timeArr.length === 2 ? [0, ...timeArr] : timeArr;
						const seconds = (hh || 0) * 3600 + (mm || 0) * 60 + (ss || 0);
						this.settings.player.seekTo(seconds);
					});
					div.appendChild(button);
				} else {
					const text = el.createEl("div");
					text.innerHTML = row;
				}
			})
		});

		// Command that gets selected youtube link and sends it to view which passes it to React component
		this.addCommand({
			id: 'trigger-youtube-view',
			name: 'Trigger Youtube View (copy youtube url and use hotkey)',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				// Get selected text and match against youtube url to convert link to youtube video id
				const url = editor.getSelection().trim();
				editor.replaceSelection(editor.getSelection() + "\n" + this.validateURL(url));
				editor.setCursor(editor.getCursor().line + 1)
			}
		});

		// This command inserts the timestamp of the playing video into the editor
		this.addCommand({
			id: 'timestamp-insert',
			name: 'Insert timestamp of based on videos current play time',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if (!this.settings.player) {
					editor.replaceSelection("A video needs to be opened before using this hotkey. Highlight your youtube link and input your preffered hotkey to register a video.")
				}

				// convert current YouTube time into timestamp
				const totalSeconds = this.settings.player.getCurrentTime().toFixed(2);
				const hours = Math.floor(totalSeconds / 3600);
				const minutes = Math.floor((totalSeconds - (hours * 3600)) / 60);
				const seconds = totalSeconds - (hours * 3600) - (minutes * 60);
				const time = (hours > 0 ? hours.toFixed(0) + ":" : "") + minutes.toFixed(0) + ":" + seconds.toFixed(0);

				// insert timestamp into editor
				editor.replaceSelection("```yt \n [" + time + "] \n ```\n")
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new YoutubeSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(YOUTUBE_VIEW);
	}

	// This is called when a valid url is found => it activates the View which loads the React view
	async activateView(url: string) {
		this.app.workspace.detachLeavesOfType(YOUTUBE_VIEW);

		await this.app.workspace.getRightLeaf(false).setViewState({
			type: YOUTUBE_VIEW,
			active: true,
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(YOUTUBE_VIEW)[0]
		);


		// This triggers the React component to be loaded
		this.app.workspace.getLeavesOfType(YOUTUBE_VIEW).forEach(async (leaf) => {
			if (leaf.view instanceof YoutubeView) {

				const setupPlayer = (yt: YouTubePlayer) => {
					this.settings.player = yt;
				}
				leaf.setEphemeralState({ url, setupPlayer });
				await this.saveSettings();
			}
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}


	async saveSettings() {
		await this.saveData(this.settings);
	}
}

export class YoutubeModal extends Modal {
	result: string;
	onSubmit: (result: string) => void;

	constructor(app: App, onSubmit: (result: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h1", { text: "Insert YouTube url " });

		new Setting(contentEl)
			.setName("Link")
			.addText((text) =>
				text.onChange((value) => {
					this.result = value
				}))

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Submit")
					.setCta()
					.onClick(async () => {
						await this.onSubmit(this.result);
						this.close();
					}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class YoutubeSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Youtube Notes Plugin' });

		new Setting(containerEl)
			.setName('Title')
			.setDesc('This will be printed after selecting each video.')
			.addText(text => text
				.setPlaceholder('Enter title template.')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}