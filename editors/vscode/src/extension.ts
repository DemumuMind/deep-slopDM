import * as vscode from 'vscode';
import { runScan, findCliPath } from './scanner';
import { updateDiagnostics } from './diagnostics';
import { createStatusBarItem, updateStatusBar } from './statusbar';

let diagnosticCollection: vscode.DiagnosticCollection;
let statusBarItem: vscode.StatusBarItem;
let saveDisposable: vscode.Disposable | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('deep-slop');
  context.subscriptions.push(diagnosticCollection);

  statusBarItem = createStatusBarItem();
  context.subscriptions.push(statusBarItem);

  // Register scanWorkspace command
  const scanWorkspaceCmd = vscode.commands.registerCommand(
    'deep-slop.scanWorkspace',
    async () => {
      if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showWarningMessage('No workspace folder open.');
        return;
      }
      const rootDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
      await doScan(rootDir);
    }
  );
  context.subscriptions.push(scanWorkspaceCmd);

  // Register scanFile command
  const scanFileCmd = vscode.commands.registerCommand(
    'deep-slop.scanFile',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file to scan.');
        return;
      }
      const rootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        ?? vscode.Uri.file(editor.document.fileName).fsPath;
      const filePath = editor.document.fileName;
      await doScan(rootDir, filePath);
    }
  );
  context.subscriptions.push(scanFileCmd);

  // Register on-save listener if configured
  registerSaveListener(context);

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('deep-slop.scanOnSave')) {
        registerSaveListener(context);
      }
    })
  );

  // Auto-scan on activation if configured
  const config = vscode.workspace.getConfiguration('deep-slop');
  if (config.get<boolean>('autoScan') && vscode.workspace.workspaceFolders?.length) {
    await doScan(vscode.workspace.workspaceFolders[0].uri.fsPath);
  }
}

async function doScan(rootDir: string, filePath?: string): Promise<void> {
  try {
    statusBarItem.text = 'deep-slop $(sync~spin)';
    statusBarItem.tooltip = 'Scanning…';

    const result = await runScan(rootDir, filePath);
    updateDiagnostics(diagnosticCollection, result);
    updateStatusBar(statusBarItem, result);
  } catch (err: any) {
    vscode.window.showErrorMessage(`deep-slop scan failed: ${err.message}`);
    statusBarItem.text = 'deep-slop ⚠';
    statusBarItem.tooltip = `Scan failed: ${err.message}`;
  }
}

function registerSaveListener(context: vscode.ExtensionContext): void {
  if (saveDisposable) {
    saveDisposable.dispose();
    saveDisposable = undefined;
  }

  const config = vscode.workspace.getConfiguration('deep-slop');
  if (config.get<boolean>('scanOnSave')) {
    saveDisposable = vscode.workspace.onDidSaveTextDocument(async (doc) => {
      const lang = doc.languageId;
      if (['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(lang)) {
        const rootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (rootDir) {
          await doScan(rootDir);
        }
      }
    });
    context.subscriptions.push(saveDisposable);
  }
}

export function deactivate(): void {
  // All disposables are pushed to context.subscriptions and auto-disposed
  diagnosticCollection?.dispose();
  statusBarItem?.dispose();
  saveDisposable?.dispose();
}
