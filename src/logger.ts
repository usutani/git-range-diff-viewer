import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function initLog(context: vscode.ExtensionContext): void {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Git Range Diff');
    context.subscriptions.push(channel);
  }
}

export function log(message: string): void {
  channel?.appendLine(`[${new Date().toISOString()}] ${message}`);
}
