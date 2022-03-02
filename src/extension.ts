import * as vscode from 'vscode'
import { DepNodeProvider } from './tree-view'

export async function activate(context: vscode.ExtensionContext) {

  const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;

	// Samples of `window.registerTreeDataProvider`
	const nodeDependenciesProvider = new DepNodeProvider(rootPath);

  vscode.window.registerTreeDataProvider('vueI18nQuery.treeView', nodeDependenciesProvider);


  context.subscriptions.push(vscode.commands.registerCommand('vueI18nQuery.query', () => {
    nodeDependenciesProvider.refreshWebview()
  }))

  context.subscriptions.push(vscode.commands.registerCommand('vueI18nQuery.replace', () => {
    nodeDependenciesProvider.replaceCode()
  }))

  context.subscriptions.push(vscode.commands.registerCommand('vueI18nQuery.clear', () => {
    nodeDependenciesProvider.clearList()
  }))

}

