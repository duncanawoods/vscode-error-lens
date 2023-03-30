import { CommandId } from 'src/commands';
import { Constants, type ExtensionConfig } from 'src/types';
import { basename } from 'src/utils';
import { languages, MarkdownString, StatusBarAlignment, ThemeColor, Uri, window, type Diagnostic, type StatusBarItem } from 'vscode';

type StatusBarProblemType = 'error' | 'warning';

interface StatusBarIconsInit {
	isEnabled: boolean;
	atZero: ExtensionConfig['statusBarIconsAtZero'];
	useBackground: ExtensionConfig['statusBarIconsUseBackground'];
	priority: ExtensionConfig['statusBarMessagePriority'];
	alignment: ExtensionConfig['statusBarMessageAlignment'];
}

/**
 * Handle status bar updates.
 */
export class StatusBarIcons {
	private readonly errorStatusBarItem: StatusBarItem;
	private readonly warningStatusBarItem: StatusBarItem;

	private readonly errorBackgroundThemeColor = new ThemeColor('statusBarItem.errorBackground');
	private readonly warningBackgroundThemeColor = new ThemeColor('statusBarItem.warningBackground');
	private readonly errorForegroundThemeColor = new ThemeColor('errorLens.statusBarIconErrorForeground');
	private readonly warningForegroundThemeColor = new ThemeColor('errorLens.statusBarIconWarningForeground');

	private readonly isEnabled: boolean;
	private readonly atZero: ExtensionConfig['statusBarIconsAtZero'];
	private readonly useBackground: ExtensionConfig['statusBarIconsUseBackground'];

	constructor({
		isEnabled,
		atZero,
		useBackground,
		priority,
		alignment,
	}: StatusBarIconsInit) {
		this.isEnabled = isEnabled;
		this.atZero = atZero;
		this.useBackground = useBackground;
		const statusBarAlignment = alignment === 'right' ? StatusBarAlignment.Right : StatusBarAlignment.Left;
		this.errorStatusBarItem = window.createStatusBarItem('errorLensError', statusBarAlignment, priority);
		this.errorStatusBarItem.name = 'Error Lens: Error icon';
		this.errorStatusBarItem.command = Constants.OpenProblemsViewCommandId;
		this.warningStatusBarItem = window.createStatusBarItem('errorLensWarning', statusBarAlignment, priority - 1);
		this.warningStatusBarItem.name = 'Error Lens: Warning icon';
		this.warningStatusBarItem.command = Constants.OpenProblemsViewCommandId;
		this.setBackground('error');
		this.setForeground('error');
		this.setBackground('warning');
		this.setForeground('warning');

		if (this.isEnabled) {
			this.errorStatusBarItem.show();
			this.warningStatusBarItem.show();
		} else {
			this.dispose();
		}
	}

	public updateText(): void {
		if (!this.isEnabled) {
			return;
		}

		const allDiagnostics = languages.getDiagnostics();
		const errorsWithUri: [Uri, Diagnostic[]][] = [];
		const warningsWithUri: [Uri, Diagnostic[]][] = [];
		let errorCount = 0;
		let warningCount = 0;

		for (const diagnosticWithUri of allDiagnostics) {
			const uri = diagnosticWithUri[0];
			const diagnostics = diagnosticWithUri[1];
			const errors = [];
			const warnings = [];
			for (const diag of diagnostics) {
				if (diag.severity === 0) {
					errors.push(diag);
				} else if (diag.severity === 1) {
					warnings.push(diag);
				}
			}
			errorCount += errors.length;
			warningCount += warnings.length;
			if (errors.length) {
				errorsWithUri.push([
					uri,
					errors,
				]);
			}
			if (warnings.length) {
				warningsWithUri.push([
					uri,
					warnings,
				]);
			}
		}
		if (errorCount === 0) {
			if (this.atZero === 'hide') {
				this.errorStatusBarItem.text = '';
			} else {
				this.clearBackground('error');
				this.clearForeground('error');
				this.errorStatusBarItem.text = `$(error) ${errorCount}`;
				this.errorStatusBarItem.tooltip = this.makeTooltip(errorsWithUri, 'error');
			}
		} else {
			this.setBackground('error');
			this.setForeground('error');
			this.errorStatusBarItem.text = `$(error) ${errorCount}`;
			this.errorStatusBarItem.tooltip = this.makeTooltip(errorsWithUri, 'error');
		}
		if (warningCount === 0) {
			if (this.atZero === 'hide') {
				this.warningStatusBarItem.text = '';
			} else {
				this.clearBackground('warning');
				this.clearForeground('warning');
				this.warningStatusBarItem.text = `$(warning) ${warningCount}`;
				this.warningStatusBarItem.tooltip = this.makeTooltip(warningsWithUri, 'warning');
			}
		} else {
			this.setBackground('warning');
			this.setForeground('warning');
			this.warningStatusBarItem.text = `$(warning) ${warningCount}`;
			this.warningStatusBarItem.tooltip = this.makeTooltip(warningsWithUri, 'warning');
		}
	}

	/**
	 * Dispose both status bar items.
	 */
	public dispose(): void {
		this.errorStatusBarItem.dispose();
		this.warningStatusBarItem.dispose();
	}

	private makeTooltip(allDiagnostics: [Uri, Diagnostic[]][], type: 'error' | 'warning'): MarkdownString {
		const markdown = new MarkdownString(undefined, true);
		markdown.isTrusted = true;
		for (const diagWithUri of allDiagnostics) {
			const uri = diagWithUri[0];
			const diagnostics = diagWithUri[1];
			if (diagnostics.length) {
				markdown.appendMarkdown(`**${basename(uri.path)}**\n\n`);
			}
			for (const diag of diagnostics) {
				const revealLineUri = Uri.parse(
					`command:${CommandId.RevealLine}?${encodeURIComponent(JSON.stringify([uri.fsPath, [diag.range.start.line, diag.range.start.character]]))}`,
				);
				// TODO: use variables --vscode-editorWarning-foreground && --vscode-editorError-foreground for **1.77.0**
				markdown.appendMarkdown(`<span style="color:${type === 'error' ? '#e45454' : '#ff942f'};">$(${type})</span> [${diag.message} \`${diag.source ?? '<No source>'}\`](${revealLineUri.toString()})\n\n`);
			}
		}
		return markdown;
	}

	private setForeground(statusBarType: StatusBarProblemType): void {
		if (statusBarType === 'error') {
			this.errorStatusBarItem.color = this.errorForegroundThemeColor;
		} else if (statusBarType === 'warning') {
			this.warningStatusBarItem.color = this.warningForegroundThemeColor;
		}
	}

	private clearForeground(statusBarType: StatusBarProblemType): void {
		if (statusBarType === 'error') {
			this.errorStatusBarItem.color = undefined;
		} else if (statusBarType === 'warning') {
			this.warningStatusBarItem.color = undefined;
		}
	}

	/**
	 * Set background (only if it's enabled) or clear it.
	 */
	private setBackground(statusBarType: StatusBarProblemType): void {
		if (!this.useBackground) {
			return;
		}

		if (statusBarType === 'error') {
			this.errorStatusBarItem.backgroundColor = this.errorBackgroundThemeColor;
		} else if (statusBarType === 'warning') {
			this.warningStatusBarItem.backgroundColor = this.warningBackgroundThemeColor;
		}
	}

	private clearBackground(statusBarType: StatusBarProblemType): void {
		if (statusBarType === 'error') {
			this.errorStatusBarItem.backgroundColor = undefined;
		} else if (statusBarType === 'warning') {
			this.warningStatusBarItem.backgroundColor = undefined;
		}
	}
}
